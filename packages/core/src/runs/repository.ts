import type {WorkspaceService} from '../workspaces/service.js';
import type {WorkspaceId,RunId} from '../../../contracts/src/ids.js';
import type {RunRecord,RunEvent,RunStatus} from '../../../contracts/src/runs.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {KeyedQueue} from './queue.js';
import type {EventWait} from './events.js';
export class RunRepository{
 private submissions=new KeyedQueue();
 private listeners=new Map<string,Set<()=>void>>();
 constructor(readonly workspaces:WorkspaceService){}
 async previous(workspaceId:WorkspaceId,sessionId:string,callerId:string,requestId:string,request:unknown):Promise<RunRecord|undefined>{
  const record=await(await this.workspaces.storeFor(workspaceId)).runs.findByRequest(sessionId as RunRecord['sessionId'],callerId,requestId)??undefined;
  if(record&&JSON.stringify(record.request)!==JSON.stringify(request))throw new ReaderError('REQUEST_ID_REUSED','同一请求标识不能用于不同问题',409);return record;
 }
 async createOrGet(record:RunRecord):Promise<{record:RunRecord;created:boolean}>{
  return this.submissions.enqueue(record.workspaceId,async()=>{
   const port=(await this.workspaces.storeFor(record.workspaceId)).runs;
   const previous=await port.findByRequest(record.sessionId,record.callerId,record.requestId);
   if(previous){if(JSON.stringify(previous.request)!==JSON.stringify(record.request))throw new ReaderError('REQUEST_ID_REUSED','同一请求标识不能用于不同问题',409);return{record:previous,created:false};}
   await port.create(record);return{record,created:true};
  });
 }
 async get(workspaceId:WorkspaceId,id:RunId){return(await this.workspaces.storeFor(workspaceId)).runs.get(id);}
 async status(workspaceId:WorkspaceId,id:RunId):Promise<RunStatus>{return(await this.workspaces.storeFor(workspaceId)).runs.status(id);}
 async save(record:RunRecord){await(await this.workspaces.storeFor(record.workspaceId)).runs.save(record);}
 async emit(record:RunRecord,kind:RunEvent['kind'],data:unknown):Promise<RunEvent>{
  const event:RunEvent={workspaceId:record.workspaceId,runId:record.id,seq:0,scope:{kind:'agent',sessionId:record.sessionId},kind,data};
  await(await this.workspaces.storeFor(record.workspaceId)).runs.appendEvent(event);this.workspaces.onLifecycle?.({workspaceId:record.workspaceId,kind:'run.event',data:event});
  this.wake(record.workspaceId,record.id);return event;
 }
 async readEvents(workspaceId:WorkspaceId,id:RunId,after:number){return(await this.workspaces.storeFor(workspaceId)).runs.readEvents(id,after);}
 /** Resolves when this process appends an event to the run, on abort, or after fallbackMs. */
 waitForEvent(workspaceId:WorkspaceId,id:RunId,signal:AbortSignal,fallbackMs=500):EventWait{
  const key=workspaceId+'/'+id;let done:()=>void=()=>{};
  const wait=new Promise<void>(resolve=>{
   const listeners=this.listeners.get(key)??new Set<()=>void>();this.listeners.set(key,listeners);
   const timer=setTimeout(()=>done(),fallbackMs);timer.unref?.();
   done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);listeners.delete(done);if(!listeners.size&&this.listeners.get(key)===listeners)this.listeners.delete(key);resolve();};
   listeners.add(done);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();
  });
  return{wait,cancel:()=>done()};
 }
 private wake(workspaceId:WorkspaceId,id:RunId){for(const listener of [...this.listeners.get(workspaceId+'/'+id)??[]])listener();}
}
