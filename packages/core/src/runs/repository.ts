import type {WorkspaceService} from '../workspaces/service.js';
import type {WorkspaceId,RunId} from '../../../contracts/src/ids.js';
import type {RunRecord,RunEvent} from '../../../contracts/src/runs.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {KeyedQueue} from './queue.js';
export class RunRepository{
 private submissions=new KeyedQueue();
 constructor(readonly workspaces:WorkspaceService){}
 async previous(workspaceId:WorkspaceId,sessionId:string,callerId:string,requestId:string,request:unknown):Promise<RunRecord|undefined>{
  const record=(await(await this.workspaces.storeFor(workspaceId)).runs.list()).find(run=>run.sessionId===sessionId&&run.callerId===callerId&&run.requestId===requestId);
  if(record&&JSON.stringify(record.request)!==JSON.stringify(request))throw new ReaderError('REQUEST_ID_REUSED','同一请求标识不能用于不同问题',409);return record;
 }
 async createOrGet(record:RunRecord):Promise<{record:RunRecord;created:boolean}>{
  return this.submissions.enqueue(record.workspaceId,async()=>{
   const port=(await this.workspaces.storeFor(record.workspaceId)).runs;
   const previous=(await port.list()).find(run=>run.sessionId===record.sessionId&&run.callerId===record.callerId&&run.requestId===record.requestId);
   if(previous){if(JSON.stringify(previous.request)!==JSON.stringify(record.request))throw new ReaderError('REQUEST_ID_REUSED','同一请求标识不能用于不同问题',409);return{record:previous,created:false};}
   await port.create(record);return{record,created:true};
  });
 }
 async get(workspaceId:WorkspaceId,id:RunId){return(await this.workspaces.storeFor(workspaceId)).runs.get(id);}
 async save(record:RunRecord){await(await this.workspaces.storeFor(record.workspaceId)).runs.save(record);}
 async emit(record:RunRecord,kind:RunEvent['kind'],data:unknown):Promise<RunEvent>{
  const event:RunEvent={workspaceId:record.workspaceId,runId:record.id,seq:0,scope:{kind:'agent',sessionId:record.sessionId},kind,data};
  await(await this.workspaces.storeFor(record.workspaceId)).runs.appendEvent(event);return event;
 }
 async readEvents(workspaceId:WorkspaceId,id:RunId,after:number){return(await this.workspaces.storeFor(workspaceId)).runs.readEvents(id,after);}
}
