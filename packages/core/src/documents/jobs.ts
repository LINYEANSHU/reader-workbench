import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {WorkspaceId,RunId,DocumentId} from '../../../contracts/src/ids.js';
import type {DocumentJobRecord,RunEvent} from '../../../contracts/src/runs.js';
import {ReaderError,publicError} from '../../../contracts/src/errors.js';
import type {WorkspaceService} from '../workspaces/service.js';
import {KeyedQueue} from '../runs/queue.js';
export class DocumentJobService {
 private controllers=new Map<RunId,AbortController>();private tasks=new Set<Promise<void>>();private recovery=new KeyedQueue();
 constructor(private workspaces:WorkspaceService){}
 async enqueue(workspaceId:WorkspaceId,documentId:DocumentId,perform:(signal:AbortSignal)=>Promise<void>,initialSignal:AbortSignal):Promise<RunId>{
  const id=randomUUID() as RunId;const store=await this.workspaces.storeFor(workspaceId);
  const record:DocumentJobRecord={id,workspaceId,documentId,kind:'document',status:'queued'};store.putRecord('document-jobs',id,record);
  await this.emit(record,'state',{status:'queued'});const controller=new AbortController();this.controllers.set(id,controller);
  const abort=()=>controller.abort();initialSignal.addEventListener('abort',abort,{once:true});if(initialSignal.aborted)abort();
  const task=new Promise<void>(resolve=>setImmediate(resolve)).then(async()=>{
   try{controller.signal.throwIfAborted();record.status='running';store.putRecord('document-jobs',id,record);await this.emit(record,'state',{status:'running'});
    await perform(controller.signal);controller.signal.throwIfAborted();record.status='completed';}
   catch(error){record.status=controller.signal.aborted?'cancelled':'failed';record.error=controller.signal.aborted?new ReaderError('CANCELLED','文档处理已取消').public():publicError(error);
    await this.emit(record,'error',record.error);}
   finally{store.putRecord('document-jobs',id,record);await this.emit(record,'state',{status:record.status});this.controllers.delete(id);initialSignal.removeEventListener('abort',abort);}
  });
  this.tasks.add(task);void task.then(()=>this.tasks.delete(task),()=>this.tasks.delete(task));return id;
 }
 async get(workspaceId:WorkspaceId,id:RunId):Promise<DocumentJobRecord>{
  return this.recovery.enqueue(workspaceId+'/'+id,async()=>{
  const record=(await this.workspaces.storeFor(workspaceId)).getRecord<DocumentJobRecord>('document-jobs',id);
  if(!record||record.workspaceId!==workspaceId)throw new ReaderError('RUN_UNAVAILABLE','文档任务不存在',404);
  if(['queued','running'].includes(record.status)&&!this.controllers.has(id)){record.status='failed';record.error=new ReaderError('RUN_INTERRUPTED','服务重启中断文档处理，请重新打开').public();(await this.workspaces.storeFor(workspaceId)).putRecord('document-jobs',id,record);await this.emit(record,'error',record.error);await this.emit(record,'state',{status:'failed'});}
  return record;
  });
 }
 async cancel(workspaceId:WorkspaceId,id:RunId){await this.get(workspaceId,id);this.controllers.get(id)?.abort();}
 async emit(record:DocumentJobRecord,kind:RunEvent['kind'],data:unknown){
  const store=await this.workspaces.storeFor(record.workspaceId);store.transaction(()=>{
   const seq=(store.getRecord<number>('document-sequences',record.id)??0)+1;
   const event:RunEvent={runId:record.id,workspaceId:record.workspaceId,seq,scope:{kind:'document',documentId:record.documentId},kind,data};
   store.putRecord('document-sequences',record.id,seq);store.putRecord('document-events',record.id+':'+String(seq).padStart(10,'0'),event);
  });
 }
 async readEvents(workspaceId:WorkspaceId,id:RunId,afterSeq:number):Promise<RunEvent[]>{
  await this.get(workspaceId,id);return(await this.workspaces.storeFor(workspaceId)).listRecords<RunEvent>('document-events').filter(event=>event.runId===id&&event.seq>afterSeq).sort((a,b)=>a.seq-b.seq);
 }
 async *events(workspaceId:WorkspaceId,id:RunId,afterSeq:number,signal:AbortSignal):AsyncIterable<RunEvent>{
  let cursor=afterSeq;
  while(!signal.aborted){
   const record=await this.get(workspaceId,id),store=await this.workspaces.storeFor(workspaceId);
   for(const event of await this.readEvents(workspaceId,id,cursor)){cursor=event.seq;yield event;}
   if(['completed','failed','cancelled'].includes(record.status))return;
   await delay(30,undefined,{signal});
  }
 }
 async close(){for(const controller of this.controllers.values())controller.abort();await Promise.allSettled([...this.tasks]);}
}
