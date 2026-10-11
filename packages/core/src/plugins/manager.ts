import {readFile,cp,mkdir,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import semver from 'semver';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {manifestSchema,SDK_VERSION} from '../../../sdk/src/manifest.js';
import type {Plugin} from '../../../sdk/src/plugin-context.js';
import type {CapabilityMap} from '../../../sdk/src/capabilities.js';
import type {WorkspaceService} from '../workspaces/service.js';
import {isWithin} from '../workspaces/path-guard.js';
import {CapabilityRegistry} from './registry.js';
interface Installation {plugin:Plugin;enabled:boolean;settings:Record<string,unknown>}
export class PluginManager {
  private installed=new Map<string,Installation>();
  private transitions=new Map<string,Promise<unknown>>();
  constructor(readonly registry:CapabilityRegistry,private workspaces?:WorkspaceService){}
  private key(workspaceId:WorkspaceId,id:string){return workspaceId+'\0'+id;}
  private validate(plugin:Plugin){
    const manifest=manifestSchema.parse(plugin.manifest);
    if(!semver.valid(manifest.version)||!semver.validRange(manifest.sdkRange)||!semver.satisfies(SDK_VERSION,manifest.sdkRange))throw new ReaderError('SDK_INCOMPATIBLE','插件 SDK 版本不兼容');
    if(typeof plugin.activate!=='function')throw new ReaderError('PLUGIN_INVALID','插件缺少 activate 方法');return manifest;
  }
  async enablePlugin(plugin:Plugin,workspaceId:WorkspaceId,settings:Record<string,unknown>={}):Promise<void>{
    const manifest=this.validate(plugin);const key=this.key(workspaceId,manifest.id);
    if(this.installed.get(key)?.enabled)throw new ReaderError('PLUGIN_ALREADY_ENABLED','插件已启用');
    this.detectCycle(workspaceId,manifest.id,manifest.dependencies);
    for(const dependency of manifest.dependencies)if(!this.installed.get(this.key(workspaceId,dependency))?.enabled)throw new ReaderError('PLUGIN_DEPENDENCY_MISSING','请先启用依赖插件: '+dependency);
    const previous=this.installed.get(key);
    this.installed.set(key,{plugin,enabled:false,settings:structuredClone(settings)});
    const context={
      workspaceId,settings:Object.freeze(structuredClone(settings)),
      register:<K extends keyof CapabilityMap>(kind:K,id:string,value:CapabilityMap[K])=>{
        if(kind==='tool')for(const tool of (value as CapabilityMap['tool']).tools){
          if(!manifest.permissions.includes('tool:'+tool.effect))throw new ReaderError('PLUGIN_PERMISSION_DENIED','插件未声明工具权限: '+tool.effect,403);
        }
        return this.registry.register(workspaceId,kind,id,value,manifest.id);
      },
      getCapability:<K extends keyof CapabilityMap>(kind:K,id:string)=>this.registry.get(workspaceId,kind,id)
    };
    try{await plugin.activate(context);this.installed.get(key)!.enabled=true;}
    catch(error){await this.registry.retireOwner(workspaceId,manifest.id);await plugin.dispose?.().catch(()=>{});if(previous)this.installed.set(key,previous);else this.installed.delete(key);throw error;}
  }
  private detectCycle(workspaceId:WorkspaceId,id:string,dependencies:string[]){
    const visit=(current:string,seen:Set<string>)=>{
      if(seen.has(current))throw new ReaderError('PLUGIN_DEPENDENCY_CYCLE','插件存在环依赖');
      const next=new Set(seen);next.add(current);
      const deps=current===id?dependencies:this.installed.get(this.key(workspaceId,current))?.plugin.manifest.dependencies??[];
      deps.forEach(dependency=>visit(dependency,next));
    };visit(id,new Set());
  }
  async disable(id:string,workspaceId:WorkspaceId):Promise<void>{
    const installation=this.installed.get(this.key(workspaceId,id));if(!installation?.enabled)return;
    for(const entry of this.installed.values())if(entry.enabled&&entry.plugin.manifest.dependencies.includes(id)&&this.installed.get(this.key(workspaceId,entry.plugin.manifest.id))===entry)throw new ReaderError('PLUGIN_DEPENDENCY_ACTIVE','先停用依赖该插件的扩展');
    installation.enabled=false;await this.registry.retireOwner(workspaceId,id);await installation.plugin.dispose?.();
  }
  async install(path:string,workspaceId:WorkspaceId):Promise<void>{
    if(!this.workspaces)throw new ReaderError('WORKSPACE_REQUIRED','请先选择工作区');
    const root=await realpath(path);const source=JSON.parse(await readFile(join(root,'plugin.json'),'utf8')) as unknown;
    const manifest=manifestSchema.parse(source);
    const workspace=await this.workspaces.get(workspaceId);
    const destination=join(workspace.root,'.reader-workbench','plugins',manifest.id);
    const existing=this.installed.get(this.key(workspaceId,manifest.id));
    if(existing)throw new ReaderError('PLUGIN_ALREADY_INSTALLED','插件已安装');
    await mkdir(dirname(destination),{recursive:true});
    const actualEntry=await realpath(resolve(root,manifest.entry));
    if(!isWithin(root,actualEntry))throw new ReaderError('PLUGIN_INVALID','插件入口必须位于插件目录');
    await cp(root,destination,{recursive:true,errorOnExist:true,force:false});
    const imported=await import(pathToFileURL(join(destination,manifest.entry)).href);
    const exported=imported.default??imported.plugin;
    const plugin:Plugin={manifest,activate:exported.activate.bind(exported),dispose:exported.dispose?.bind(exported)};
    this.validate(plugin);this.installed.set(this.key(workspaceId,manifest.id),{plugin,enabled:false,settings:{}});
    const store=await this.workspaces.storeFor(workspaceId);store.putRecord('plugins',manifest.id,{manifest,path:destination,enabled:false,settings:{}});
  }
  async enable(id:string,workspaceId:WorkspaceId):Promise<void>{
    const installed=this.installed.get(this.key(workspaceId,id));if(!installed)throw new ReaderError('PLUGIN_NOT_INSTALLED','请先安装插件');
    await this.enablePlugin(installed.plugin,workspaceId,installed.settings);
  }
  list(workspaceId:WorkspaceId){return [...this.installed.entries()].filter(([key])=>key.startsWith(workspaceId+'\0')).map(([,entry])=>({manifest:entry.plugin.manifest,enabled:entry.enabled,settings:structuredClone(entry.settings)}));}
}
