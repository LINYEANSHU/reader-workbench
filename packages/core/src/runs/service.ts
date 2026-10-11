import {randomUUID} from 'node:crypto';
import type {WorkspaceService} from '../workspaces/service.js';import type {SessionRepository} from '../sessions/repository.js';import type {ContextBuilder} from '../sessions/context.js';import type {DocumentService} from '../documents/service.js';import type {CapabilityRegistry} from '../plugins/registry.js';import type {ToolRegistry} from '../tools/registry.js';
import type {AskRequest} from '../../../contracts/src/sessions.js';import type {Actor,WorkspaceId,RunId,RunScope} from '../../../contracts/src/ids.js';import type {RunRecord,DocumentJobRecord,RunEvent} from '../../../contracts/src/runs.js';
import {ReaderError,publicError} from '../../../contracts/src/errors.js';
import {RunRepository} from './repository.js';import {KeyedQueue} from './queue.js';import {terminal,replayEvents} from './events.js';import {toolLoop} from './tool-loop.js';import {ToolExecutor} from '../tools/executor.js';
import {builtinTools} from '../tools/builtins.js';
interface Dependencies{workspaces:WorkspaceService;repository:SessionRepository;context:ContextBuilder;tools:ToolRegistry;documents:DocumentService;capabilities:CapabilityRegistry}
export class RunService{
 readonly records:RunRepository;readonly executor:ToolExecutor;private queue=new KeyedQueue();private recovery=new KeyedQueue();private controllers=new Map<RunId,AbortController>();private liveRecords=new Map<RunId,RunRecord>();private tasks=new Map<RunId,Promise<void>>();private closed=false;
 constructor(readonly dependencies:Dependencies){this.records=new RunRepository(dependencies.workspaces);this.executor=new ToolExecutor(dependencies.tools,dependencies.workspaces);if(!dependencies.capabilities.list('*' as WorkspaceId,'tool').includes('core.reading'))dependencies.capabilities.register('*','tool','core.reading',builtinTools(dependencies.documents,dependencies.repository));}
 async submit(request:AskRequest,actor:Actor):Promise<{runId:RunId}>{
  if(this.closed)throw new ReaderError('SERVER_CLOSING','服务正在退出',503);
  if(!request.requestId||request.requestId.length>200||typeof request.question!=='string'||!request.question.trim()||Buffer.byteLength(request.question)>1024*1024)throw new ReaderError('INVALID_REQUEST','问题或请求标识无效');
  const session=await this.dependencies.repository.getSession(request.workspaceId,request.sessionId);if(session.callerId!==actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','会话不属于此调用者',403);
  this.dependencies.capabilities.get(request.workspaceId,'model',request.providerId);
  const record:RunRecord={id:randomUUID() as RunId,kind:'agent',workspaceId:request.workspaceId,sessionId:request.sessionId,status:'queued',requestId:request.requestId,request:structuredClone(request),callerId:actor.callerId,createdAt:new Date().toISOString(),partialText:''};
  const result=await this.records.createOrGet(record);if(!result.created)return{runId:result.record.id};
  const controller=new AbortController();this.controllers.set(record.id,controller);this.liveRecords.set(record.id,record);await this.records.emit(record,'state',{status:'queued'});
  const task=this.queue.enqueue(record.workspaceId+'/'+record.sessionId,()=>this.perform(record,actor,controller.signal));this.tasks.set(record.id,task);
  const cleanup=()=>{this.tasks.delete(record.id);this.controllers.delete(record.id);this.liveRecords.delete(record.id);};void task.then(cleanup,cleanup);return{runId:record.id};
 }
 private async perform(record:RunRecord,actor:Actor,signal:AbortSignal){
  if(terminal(record))return;
  let release:(()=>void)|undefined;let releaseModel:(()=>void)|undefined;
  try{
   signal.throwIfAborted();
   const initialScope:RunScope={actor:structuredClone(actor),workspaceId:record.workspaceId,sessionId:record.sessionId,runId:record.id,allowArtifactWrites:record.request.allowArtifactWrites};release=await this.dependencies.repository.registerScope(initialScope);
   record.status='running';await this.records.save(record);await this.records.emit(record,'state',{status:'running'});
   const model=this.dependencies.capabilities.acquire(record.workspaceId,'model',record.request.providerId);releaseModel=model.release;
   const envelope=await this.dependencies.context.build(record.request,signal,model.value);record.contextRevision=envelope.mainRevision;record.context=envelope;await this.records.save(record);await this.records.emit(record,'context',{mainRevision:envelope.mainRevision,ownRevision:envelope.ownRevision,budget:envelope.budget,summaryCoverage:envelope.summaryCoverage});
   const sessionRecord=await this.dependencies.repository.getSession(record.workspaceId,record.sessionId);
   const readRevisions:Record<string,number>={[record.sessionId]:envelope.ownRevision??sessionRecord.revision};if(sessionRecord.parentMainSessionId)readRevisions[sessionRecord.parentMainSessionId]=envelope.mainRevision;
   const scope=await this.dependencies.repository.setReadRevisions(initialScope,readRevisions);
   if(envelope.memory)await this.dependencies.repository.saveOwnSummary(scope,envelope.memory);
   const session=await this.dependencies.repository.authorizeScope(scope);
   const definitions=this.dependencies.tools.list(scope.workspaceId).filter(tool=>session.kind==='main'||tool.effect==='read'||tool.effect==='write_artifact'&&scope.allowArtifactWrites);
   const tools=model.value.capabilities.tools?definitions.map(tool=>({type:'function' as const,function:{name:tool.name,description:tool.description,parameters:tool.inputSchema}})):[];
   const result=await toolLoop(model.value,envelope,tools,scope,this.executor,async(kind,data)=>{
    if(kind==='delta'){record.partialText+=(data as {text:string}).text;await this.records.save(record);}await this.records.emit(record,kind,data);
   },signal);signal.throwIfAborted();
   for(const anchor of envelope.sourceRanges)await this.records.emit(record,'citation',anchor);
   const content=record.request.question+(record.request.selection?'\n选区：'+record.request.selection.text+'\n来源：'+JSON.stringify(record.request.selection.anchors):'');
   await this.dependencies.repository.completeOwnTurn(scope,{id:randomUUID(),runId:record.id,question:record.request.question,answer:result.answer,messages:[{role:'user',content},...result.ownMessages],sourceAnchors:[...envelope.sourceRanges,...result.anchors],attachmentIds:record.request.attachmentIds});
   record.result=result.answer;record.status='completed';
  }catch(error){record.status=signal.aborted?'cancelled':'failed';record.error=signal.aborted?new ReaderError('CANCELLED','本次回答已取消，部分输出未加入会话记忆').public():publicError(error);await this.records.emit(record,'error',record.error);}
  finally{release?.();releaseModel?.();await this.records.save(record);await this.records.emit(record,'state',{status:record.status});}
 }
 async get(workspaceId:WorkspaceId,id:RunId):Promise<RunRecord|DocumentJobRecord>{
  return this.recovery.enqueue(workspaceId+'/'+id,async()=>{
  let record:RunRecord;try{record=await this.records.get(workspaceId,id);}catch(error){if(error instanceof ReaderError&&error.code==='RUN_UNAVAILABLE')return this.dependencies.documents.jobs.get(workspaceId,id);throw error;}
  if(!terminal(record)&&!this.controllers.has(id)){record.status='failed';record.error=new ReaderError('RUN_INTERRUPTED','服务重启中断本次运行，请重新提问').public();await this.records.save(record);await this.records.emit(record,'error',record.error);await this.records.emit(record,'state',{status:'failed'});}return record;
  });
 }
 async *events(workspaceId:WorkspaceId,id:RunId,afterSeq:number,signal:AbortSignal):AsyncIterable<RunEvent>{
  if(!Number.isSafeInteger(afterSeq)||afterSeq<0)throw new ReaderError('INVALID_CURSOR','事件序号无效');const record=await this.get(workspaceId,id);
  if(record.kind==='document'){yield* this.dependencies.documents.jobs.events(workspaceId,id,afterSeq,signal);return;}
  yield* replayEvents(async()=>await this.get(workspaceId,id) as RunRecord,after=>this.records.readEvents(workspaceId,id,after),afterSeq,signal);
 }
 async cancel(workspaceId:WorkspaceId,id:RunId,actor:Actor):Promise<void>{
  const record=await this.get(workspaceId,id);if(record.kind==='document'){await this.dependencies.documents.jobs.cancel(workspaceId,id);return;}
  if(record.callerId!==actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','不能取消其他调用者运行',403);this.controllers.get(id)?.abort();
  const live=this.liveRecords.get(id);if(live?.status==='queued'){live.status='cancelled';live.error=new ReaderError('CANCELLED','排队请求已取消').public();await this.records.save(live);await this.records.emit(live,'error',live.error);await this.records.emit(live,'state',{status:'cancelled'});return;}
  await this.tasks.get(id);
 }
 async close(){this.closed=true;for(const controller of this.controllers.values())controller.abort();await Promise.allSettled([...this.tasks.values()]);}
}
