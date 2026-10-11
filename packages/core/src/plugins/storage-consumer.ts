import type {WorkspaceStore} from '../../../contracts/src/storage.js';import type {RunScope,WorkspaceId} from '../../../contracts/src/ids.js';import type {StorageProvider} from '../../../sdk/src/capabilities.js';import type {SqliteWorkspaceStore} from '../storage/workspace-store.js';import type {CapabilityRegistry} from './registry.js';import {ReaderError} from '../../../contracts/src/errors.js';
const ports=['documents','sessions','runs','artifacts','attachments'] as const;
export class StorageConsumer{
 private opened=new Map<WorkspaceId,Map<StorageProvider,Promise<WorkspaceStore>>>();
 constructor(private registry:CapabilityRegistry){}
 wrap(core:SqliteWorkspaceStore,root:string):SqliteWorkspaceStore{
  const base:WorkspaceStore={workspaceId:core.workspaceId,documents:Object.freeze({...core.documents}),sessions:Object.freeze({...core.sessions}),runs:Object.freeze({...core.runs}),artifacts:Object.freeze({...core.artifacts}),attachments:Object.freeze({...core.attachments}),close:async()=>{}};
  const wrappers=new Map<string,object>();
  for(const port of ports)wrappers.set(port,new Proxy(core[port],{get:(_target,method)=>{
   if(typeof method!=='string'||!(method in core[port]))return undefined;
   return async(...args:unknown[])=>{
    const input=args[0] as {workspaceId?:WorkspaceId;record?:{workspaceId:WorkspaceId}}|undefined;
    const workspaceId=input?.workspaceId??input?.record?.workspaceId;if(workspaceId&&workspaceId!==core.workspaceId)throw new ReaderError('TOOL_SCOPE_DENIED','存储操作不能越过工作区',403);
    if(port==='sessions'&&['completeOwnTurn','saveOwnSummary','saveOwnToolState'].includes(method)){const scope=args[0] as RunScope;await core.authorizeScope(scope);if(method==='completeOwnTurn'&&(args[1] as {runId:string}).runId!==scope.runId)throw new ReaderError('TOOL_SCOPE_DENIED','轮次不属于此运行',403);}
    if(port==='sessions'&&method==='clearTemporary'){const session=await core.sessions.getSession(args[0] as Parameters<typeof core.sessions.getSession>[0]);if(session.kind!=='temporary'||session.callerId!==(args[1] as {callerId:string}).callerId)throw new ReaderError('TOOL_SCOPE_DENIED','只能清空所属临时会话',403);}
    const id=this.registry.list(core.workspaceId,'storage').at(-1);if(!id)return (core[port] as unknown as Record<string,(...args:unknown[])=>unknown>)[method]!(...args);
    const lease=this.registry.acquire(core.workspaceId,'storage',id);try{
     let providers=this.opened.get(core.workspaceId);if(!providers){providers=new Map();this.opened.set(core.workspaceId,providers);}let opening=providers.get(lease.value);if(!opening){opening=lease.value.open(root,{workspaceId:core.workspaceId,base:Object.freeze(base)});providers.set(lease.value,opening);void opening.catch(()=>{if(providers!.get(lease.value)===opening)providers!.delete(lease.value);});}
     const extension=await opening;if(extension.workspaceId!==core.workspaceId||typeof extension[port]?.[method as keyof typeof extension[typeof port]]!=='function')throw new ReaderError('STORAGE_PROVIDER_INVALID','存储扩展没有提供当前工作区的端口');
     const invoke=(extension[port] as unknown as Record<string,(...args:unknown[])=>unknown>)[method]!,cloned=structuredClone(args),result=await invoke.apply(extension[port],cloned);if(port==='runs'&&method==='appendEvent')(args[0] as {seq:number}).seq=(cloned[0] as {seq:number}).seq;return result;
    }finally{lease.release();}
   };
  }}));
  return new Proxy(core,{get:(target,key)=>{if(typeof key==='string'&&wrappers.has(key))return wrappers.get(key);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 }
 async close(){for(const providers of this.opened.values())for(const opening of providers.values())try{await(await opening).close();}catch{}this.opened.clear();}
}
