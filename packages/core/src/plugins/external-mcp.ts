import {Client,StreamableHTTPClientTransport,type Tool} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import type {ExternalMcpConfig,ToolDefinition} from '../../../contracts/src/tools.js';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {ToolProvider} from '../../../sdk/src/capabilities.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {AsyncLocalStorage} from 'node:async_hooks';import {createHash} from 'node:crypto';
import type {CapabilityRegistry} from './registry.js';import type {WorkspaceService} from '../workspaces/service.js';import {CredentialStore} from '../runtime/credentials.js';
export interface ExternalToolConnection{client:Client;provider:ToolProvider;refresh():Promise<void>;close():Promise<void>;onChanged?:(provider:ToolProvider)=>void}
export async function connectExternalMcp(config:ExternalMcpConfig,_workspaceId:WorkspaceId,credential?:string):Promise<ExternalToolConnection>{
 if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(config.id))throw new ReaderError('MCP_CONFIG_INVALID','MCP 名称无效');
 const client=new Client({name:'reader-external-'+config.id,version:'1'}),provider:ToolProvider={tools:[]},requestSignals=new AsyncLocalStorage<AbortSignal>();let closed=false;
 const toolName=(name:string)=>{const full='mcp_'+config.id+'_'+name.replace(/[^a-zA-Z0-9_-]/g,'_');return full.length<=64?full:full.slice(0,51)+'_'+createHash('sha256').update(full).digest('hex').slice(0,12);};
 const connection:ExternalToolConnection={client,provider,async refresh(){
  if(closed)throw new ReaderError('MCP_DISCONNECTED','外部 MCP 已断开');const discovered:Tool[]=[];let cursor:string|undefined;
  do{const response=await client.listTools(cursor?{cursor}:undefined,{cacheMode:'refresh',timeout:10000});discovered.push(...response.tools);cursor=response.nextCursor;if(discovered.length>500)throw new ReaderError('MCP_TOOL_LIMIT','外部工具数量超过上限');}while(cursor);
  provider.tools=discovered.map(tool=>({name:toolName(tool.name),description:tool.description,inputSchema:structuredClone(tool.inputSchema),effect:config.effects[tool.name]??'external_write',async execute(input,_scope,signal){
   if(closed)throw new ReaderError('MCP_DISCONNECTED','外部 MCP 已断开');const operationSignal=AbortSignal.any([signal,AbortSignal.timeout(120000)]),result=await requestSignals.run(operationSignal,()=>client.callTool({name:tool.name,arguments:input as Record<string,unknown>},{signal:operationSignal,timeout:120000}));
   if(result.isError)throw new ReaderError('MCP_TOOL_FAILED','外部 MCP 工具报告失败');const content=result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
   return{content:content||JSON.stringify(result.structuredContent??{}),data:result.structuredContent};
  }} satisfies ToolDefinition));
  if(new Set(provider.tools.map(tool=>tool.name)).size!==provider.tools.length)throw new ReaderError('MCP_TOOL_DUPLICATE','规范化后的 MCP 工具名称重复');connection.onChanged?.(provider);
 },async close(){if(closed)return;closed=true;await client.close();}};
 try{
  const transport=config.transport==='stdio'?new StdioClientTransport({command:config.command??'',args:config.args??[],stderr:'pipe'}):new StreamableHTTPClientTransport(new URL(config.url??''),{requestInit:credential?{headers:{authorization:'Bearer '+credential}}:undefined,fetch:(url,init)=>{const operation=requestSignals.getStore(),signals=[init?.signal,operation].filter((value):value is AbortSignal=>Boolean(value));return fetch(url,{...init,...(signals.length?{signal:AbortSignal.any(signals)}:{})});}});
  await client.connect(transport,{timeout:10000});client.setNotificationHandler('notifications/tools/list_changed',()=>{void connection.refresh().catch(()=>{});});await connection.refresh();return connection;
 }catch(error){await connection.close();throw error instanceof ReaderError?error:new ReaderError('MCP_CONNECTION_FAILED','无法连接外部 MCP，请检查服务和运行环境');}
}
interface ManagedConnection{config:ExternalMcpConfig;enabled:boolean;connection?:ExternalToolConnection;release?:()=>void;error?:string}
export class ExternalMcpManager{
 private entries=new Map<string,ManagedConnection>();private transitions=new Map<string,Promise<unknown>>();private credentials:CredentialStore;
 constructor(private registry:CapabilityRegistry,private workspaces:WorkspaceService){this.credentials=new CredentialStore(workspaces.configDir);}
 private key(workspaceId:WorkspaceId,id:string){return workspaceId+'\0'+id;}
 private serial<T>(key:string,action:()=>Promise<T>):Promise<T>{const previous=this.transitions.get(key),task=previous?previous.catch(()=>{}).then(action):action();this.transitions.set(key,task);void task.finally(()=>{if(this.transitions.get(key)===task)this.transitions.delete(key);}).catch(()=>{});return task;}
 private async save(workspaceId:WorkspaceId,entry:ManagedConnection){(await this.workspaces.storeFor(workspaceId)).putRecord('external-mcp',entry.config.id,{config:entry.config,enabled:entry.enabled});}
 private async activate(workspaceId:WorkspaceId,entry:ManagedConnection){
  if(entry.config.credentialRef&&!await this.credentials.hasSecret(entry.config.credentialRef))delete entry.config.credentialRef;
  const secret=entry.config.credentialRef?await this.credentials.getSecret(entry.config.credentialRef):undefined,connection=await connectExternalMcp(entry.config,workspaceId,secret);
  const publish=()=>{if(!entry.enabled)return;entry.release?.();entry.release=this.registry.register(workspaceId,'tool','mcp.'+entry.config.id,connection.provider,'mcp:'+entry.config.id);};
  entry.connection=connection;entry.enabled=true;connection.onChanged=publish;publish();delete entry.error;await this.save(workspaceId,entry);
 }
 private async disconnect(workspaceId:WorkspaceId,entry:ManagedConnection,persist=true){entry.enabled=false;if(entry.connection)entry.connection.onChanged=undefined;entry.release?.();entry.release=undefined;await this.registry.retireOwner(workspaceId,'mcp:'+entry.config.id);await entry.connection?.close();entry.connection=undefined;if(persist)await this.save(workspaceId,entry);}
 async configure(workspaceId:WorkspaceId,raw:ExternalMcpConfig,secret?:string){
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(raw.id)||!['stdio','http'].includes(raw.transport)||raw.transport==='stdio'&&(!raw.command||!Array.isArray(raw.args))||raw.transport==='http'&&!raw.url)throw new ReaderError('MCP_CONFIG_INVALID','MCP 配置无效');
  if(raw.url){const url=new URL(raw.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new ReaderError('MCP_CONFIG_INVALID','MCP 地址必须为 HTTP 或 HTTPS，凭据请单独保存');}
  return this.serial(this.key(workspaceId,raw.id),async()=>{const previous=this.entries.get(this.key(workspaceId,raw.id));if(previous)await this.disconnect(workspaceId,previous,false);const config=structuredClone(raw),credentialRef='external-mcp.'+workspaceId+'.'+raw.id;delete config.credentialRef;if(secret!==undefined)await this.credentials.setSecret(credentialRef,secret);if(await this.credentials.hasSecret(credentialRef))config.credentialRef=credentialRef;const entry:ManagedConnection={config,enabled:false};this.entries.set(this.key(workspaceId,raw.id),entry);await this.save(workspaceId,entry);try{await this.activate(workspaceId,entry);}catch(error){entry.error=error instanceof ReaderError?error.message:'MCP 连接失败';throw error;}});
 }
 async disable(id:string,workspaceId:WorkspaceId){return this.serial(this.key(workspaceId,id),async()=>{const entry=this.entries.get(this.key(workspaceId,id));if(entry)await this.disconnect(workspaceId,entry);});}
 async enable(id:string,workspaceId:WorkspaceId){return this.serial(this.key(workspaceId,id),async()=>{const entry=this.entries.get(this.key(workspaceId,id));if(!entry)throw new ReaderError('MCP_CONFIG_UNAVAILABLE','请先配置外部 MCP');if(!entry.enabled)await this.activate(workspaceId,entry);});}
 async refresh(id:string,workspaceId:WorkspaceId){const entry=this.entries.get(this.key(workspaceId,id));if(!entry?.connection)throw new ReaderError('MCP_DISCONNECTED','外部 MCP 尚未连接');await entry.connection.refresh();}
 list(workspaceId:WorkspaceId){return[...this.entries.entries()].filter(([key])=>key.startsWith(workspaceId+'\0')).map(([,entry])=>({config:structuredClone(entry.config),enabled:entry.enabled,toolCount:entry.connection?.provider.tools.length??0,...(entry.error?{error:entry.error}:{})}));}
 async loadWorkspace(workspaceId:WorkspaceId){const store=await this.workspaces.storeFor(workspaceId);for(const record of store.listRecords<{config:ExternalMcpConfig;enabled:boolean}>('external-mcp')){if(this.entries.has(this.key(workspaceId,record.config.id)))continue;const entry:ManagedConnection={config:record.config,enabled:false};this.entries.set(this.key(workspaceId,record.config.id),entry);if(record.enabled)try{await this.activate(workspaceId,entry);}catch{entry.error='MCP 服务暂不可用';}}}
 async loadRecent(){for(const workspace of await this.workspaces.listRecent({callerId:'local-owner',transport:'internal'}))await this.loadWorkspace(workspace.id);}
 async close(){await Promise.allSettled([...this.transitions.values()]);for(const[key,entry]of this.entries)await this.disconnect(key.split('\0')[0] as WorkspaceId,entry,false);}
}
