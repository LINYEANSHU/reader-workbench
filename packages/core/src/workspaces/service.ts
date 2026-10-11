import {readFile,realpath,stat,mkdir,lstat,writeFile,rm,readdir} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import type {Actor,WorkspaceId} from '../../../contracts/src/ids.js';
import type {Workspace,DirectoryEntry,FileEntry} from '../../../contracts/src/workspaces.js';
import type {UiState} from '../../../contracts/src/ui-state.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {writePrivateJson} from '../runtime/secure-file.js';
import {SqliteWorkspaceStore} from '../storage/workspace-store.js';
import {isWithin,resolveScopedPath} from './path-guard.js';
import {browseDirectories} from './directory-browser.js';
import type {CapabilityRegistry} from '../plugins/registry.js';import {StorageConsumer} from '../plugins/storage-consumer.js';import type {LifecycleEvent} from '../../../contracts/src/runs.js';
interface SavedWorkspace extends Workspace {callerId:string}
export class WorkspaceService {
  onSelected?: (id:WorkspaceId)=>Promise<void>;
  onLifecycle?: (event:LifecycleEvent)=>void;
  private capabilities?:CapabilityRegistry;private storage?:StorageConsumer;private wrapped=new Map<WorkspaceId,SqliteWorkspaceStore>();
  attachCapabilities(registry:CapabilityRegistry){this.capabilities=registry;this.storage=new StorageConsumer(registry);}
  private workspaces=new Map<WorkspaceId,SavedWorkspace>();private stores=new Map<WorkspaceId,SqliteWorkspaceStore>();private ready:Promise<void>;
  private selecting:Promise<unknown>=Promise.resolve();
  private configRoot:string;
  constructor(readonly configDir:string){this.configRoot=resolve(configDir);this.ready=this.load();}
  private async load(){await mkdir(this.configDir,{recursive:true,mode:0o700});this.configRoot=await realpath(this.configDir);
    try{const records=JSON.parse(await readFile(join(this.configDir,'workspaces.json'),'utf8')) as SavedWorkspace[];
    for(const record of records)this.workspaces.set(record.id,record);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  async get(id:WorkspaceId):Promise<Workspace>{await this.ready;const record=this.workspaces.get(id);if(!record)throw new ReaderError('WORKSPACE_REQUIRED','请先选择工作区',409);return {id:record.id,root:record.root,name:record.name};}
  async select(root:string,actor:Actor):Promise<Workspace>{
    const operation=this.selecting.catch(()=>{}).then(async()=>{
      await this.ready;let actual:string;
      try{actual=await realpath(resolve(root));if(!(await stat(actual)).isDirectory())throw new Error('not directory');}
      catch{throw new ReaderError('WORKSPACE_UNAVAILABLE','工作区目录不存在或不可访问',404);}
      if(isWithin(this.configRoot,actual))throw new ReaderError('PATH_OUTSIDE_WORKSPACE','全局配置目录不能作为阅读工作区',403);
      const id=createHash('sha256').update(process.platform==='win32'?actual.toLowerCase():actual).digest('hex').slice(0,24) as WorkspaceId;
      await this.ensureStorage(actual);
      const workspace:SavedWorkspace={id,root:actual,name:basename(actual)||actual,callerId:actor.callerId};
      this.workspaces.set(id,workspace);
      await writePrivateJson(join(this.configDir,'workspaces.json'),[...this.workspaces.values()]);
      await this.storeFor(id);
      await this.onSelected?.(id);
      this.onLifecycle?.({workspaceId:id,kind:'workspace.selected',data:{name:workspace.name}});
      return {id,root:actual,name:workspace.name};
    });
    this.selecting=operation;return operation;
  }
  private async ensureStorage(root:string){
    const internal=join(root,'.reader-workbench');
    try{
      try{if((await lstat(internal)).isSymbolicLink())throw new ReaderError('PATH_OUTSIDE_WORKSPACE','内部存储目录不能是链接',403);}
      catch(error){if(error instanceof ReaderError)throw error;if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      await mkdir(internal,{recursive:true});
      if(await realpath(internal)!==internal)throw new ReaderError('PATH_OUTSIDE_WORKSPACE','内部存储目录路径异常',403);
      for(const name of ['state.sqlite','state.sqlite-wal','state.sqlite-shm']){
        try{if((await lstat(join(internal,name))).isSymbolicLink())throw new ReaderError('PATH_OUTSIDE_WORKSPACE','数据库不能指向链接',403);}
        catch(error){if(error instanceof ReaderError)throw error;if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      }
      const probe=join(internal,'.write-'+randomUUID());await writeFile(probe,'',{flag:'wx',mode:0o600});await rm(probe);
    }catch(error){if(error instanceof ReaderError)throw error;throw new ReaderError('WORKSPACE_NOT_WRITABLE','工作区不可写，请选择可写目录',403);}
  }
  async storeFor(id:WorkspaceId):Promise<SqliteWorkspaceStore>{
    const workspace=await this.get(id);let store=this.stores.get(id);
    if(!store){await this.ensureStorage(workspace.root);store=new SqliteWorkspaceStore(id,join(workspace.root,'.reader-workbench','state.sqlite'));this.stores.set(id,store);}
    if(!this.storage)return store;let wrapped=this.wrapped.get(id);if(!wrapped){wrapped=this.storage.wrap(store,workspace.root);this.wrapped.set(id,wrapped);}return wrapped;
  }
  async listRecent(actor:Actor):Promise<Workspace[]>{await this.ready;return [...this.workspaces.values()].filter(w=>w.callerId===actor.callerId).map(({callerId,...workspace})=>workspace);}
  async browseDirectories(input:string,actor:Actor,workspaceId?:WorkspaceId):Promise<DirectoryEntry[]>{if(workspaceId){if(!(await this.listRecent(actor)).some(workspace=>workspace.id===workspaceId))throw new ReaderError('WORKSPACE_DENIED','工作区不属于此调用者',403);const id=this.capabilities?.list(workspaceId,'workspace').at(-1);if(id){const lease=this.capabilities!.acquire(workspaceId,'workspace',id);try{const result=await lease.value.browse(input,structuredClone(actor));if(!Array.isArray(result)||result.length>2000||result.some(entry=>typeof entry.name!=='string'||typeof entry.path!=='string'))throw new ReaderError('WORKSPACE_PROVIDER_INVALID','工作区扩展返回的目录无效');return result;}finally{lease.release();}}}return browseDirectories(input);}
  async resolvePath(id:WorkspaceId,input:string,mode:'read'|'create'):Promise<string>{
    return resolveScopedPath((await this.get(id)).root,input,mode,[this.configRoot]);
  }
  async listFiles(id:WorkspaceId,input=''):Promise<FileEntry[]>{
    const directory=await this.resolvePath(id,input,'read');const entries=await readdir(directory,{withFileTypes:true});const results:FileEntry[]=[];
    for(const entry of entries){
      if(entry.name==='.reader-workbench'||entry.name==='.git'||entry.name==='node_modules')continue;
      const relativePath=input?input.replace(/[\\/]$/,'')+'/'+entry.name:entry.name;
      try{const file=await this.resolvePath(id,relativePath,'read');const info=await stat(file);
        results.push({name:entry.name,relativePath,kind:info.isDirectory()?'directory':'file',size:info.size});}catch{}
    }
    return results.sort((a,b)=>(a.kind==='directory'?0:1)-(b.kind==='directory'?0:1)||a.name.localeCompare(b.name));
  }
  async saveUiState(id:WorkspaceId,clientId:string,state:UiState){if(!clientId||clientId.length>128||JSON.stringify(state).length>1024*1024)throw new ReaderError('INVALID_UI_STATE','界面状态无效');await(await this.storeFor(id)).saveUiState(clientId,state);}
  async getUiState(id:WorkspaceId,clientId:string){return(await this.storeFor(id)).getUiState(clientId);}
  async close(){await this.storage?.close();this.wrapped.clear();for(const store of this.stores.values())await store.close();this.stores.clear();}
}
