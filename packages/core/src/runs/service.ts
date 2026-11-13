import {randomUUID} from 'node:crypto';
import type {WorkspaceService} from '../workspaces/service.js';import type {SessionRepository} from '../sessions/repository.js';import type {ContextBuilder} from '../sessions/context.js';import type {DocumentService} from '../documents/service.js';import type {CapabilityRegistry} from '../plugins/registry.js';import type {ToolRegistry} from '../tools/registry.js';
import type {AskRequest} from '../../../contracts/src/sessions.js';import type {Actor,WorkspaceId,RunId,RunScope} from '../../../contracts/src/ids.js';import type {RunRecord,DocumentJobRecord,RunEvent} from '../../../contracts/src/runs.js';
import {ReaderError,publicError} from '../../../contracts/src/errors.js';
import {RunRepository} from './repository.js';import {KeyedQueue} from './queue.js';import {terminal,replayEvents} from './events.js';import {toolLoop} from './tool-loop.js';import {ToolExecutor} from '../tools/executor.js';
import {builtinTools} from '../tools/builtins.js';
import type {ModelProvider} from '../../../sdk/src/capabilities.js';
import type {ArtifactService} from '../artifacts/service.js';
import {artifactTools} from '../tools/artifacts.js';
import {uniqueAnchors} from '../../../contracts/src/documents.js';
import type {CapabilityLease} from '../plugins/registry.js';
import type {DocumentMemoryConsumer} from '../documents/memory-consumer.js';
import {validateImageRequest,DEFAULT_IMAGE_LIMITS} from '../models/image-budget.js';
import {modelUsageScope} from '../models/usage-scope.js';
import {withoutReasoning} from '../sessions/memory.js';
import {DeltaBatcher} from './delta-batcher.js';
const PARTIAL_SAVE_INTERVAL_MS=250,SELECTION_HISTORY_TOKENS=24*1024;
import {clipMiddle} from '../models/tokens.js';
interface Dependencies{workspaces:WorkspaceService;repository:SessionRepository;context:ContextBuilder;tools:ToolRegistry;documents:DocumentService;capabilities:CapabilityRegistry;artifacts?:ArtifactService;documentMemory?:DocumentMemoryConsumer}
export class RunService{
 readonly records:RunRepository;readonly executor:ToolExecutor;private queue=new KeyedQueue();private recovery=new KeyedQueue();private controllers=new Map<RunId,AbortController>();private liveRecords=new Map<RunId,RunRecord>();private modelLeases=new Map<RunId,CapabilityLease<ModelProvider>>();private tasks=new Map<RunId,Promise<void>>();private compactions=new Map<string,AbortController>();private closed=false;
 constructor(readonly dependencies:Dependencies){this.records=new RunRepository(dependencies.workspaces);this.executor=new ToolExecutor(dependencies.tools,dependencies.workspaces);dependencies.context.attachToolExecutor(this.executor);if(!dependencies.capabilities.list('*' as WorkspaceId,'tool').includes('core.reading'))dependencies.capabilities.register('*','tool','core.reading',builtinTools(dependencies.documents,dependencies.repository,this.records));if(dependencies.artifacts)dependencies.capabilities.register('*','tool','core.artifacts',artifactTools(dependencies.artifacts));}
 async submit(request:AskRequest,actor:Actor):Promise<{runId:RunId}>{
  if(this.closed)throw new ReaderError('SERVER_CLOSING','服务正在退出',503);
  if(!request.requestId||request.requestId.length>200||typeof request.question!=='string'||!request.question.trim()||Buffer.byteLength(request.question)>1024*1024)throw new ReaderError('INVALID_REQUEST','问题或请求标识无效');
  const session=await this.dependencies.repository.getSession(request.workspaceId,request.sessionId);if(session.callerId!==actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','会话不属于此调用者',403);
  const previous=await this.records.previous(request.workspaceId,request.sessionId,actor.callerId,request.requestId,request);if(previous)return{runId:previous.id};
  const model=this.dependencies.capabilities.acquire(request.workspaceId,'model',request.providerId);
  if(request.reasoningEffort!==undefined&&!model.value.capabilities.reasoningEfforts?.includes(request.reasoningEffort)){model.release();throw new ReaderError('REASONING_UNSUPPORTED','所选模型不支持此思考档位');}
  const record:RunRecord={id:randomUUID() as RunId,kind:'agent',workspaceId:request.workspaceId,sessionId:request.sessionId,status:'queued',requestId:request.requestId,request:structuredClone(request),callerId:actor.callerId,createdAt:new Date().toISOString(),partialText:''};
  let result;try{record.outputDirectory=await this.dependencies.artifacts?.getOutputDirectory(request.workspaceId);result=await this.records.createOrGet(record);}catch(error){model.release();throw error;}if(!result.created){model.release();return{runId:result.record.id};}this.modelLeases.set(record.id,model);
  const controller=new AbortController();this.controllers.set(record.id,controller);this.liveRecords.set(record.id,record);await this.records.emit(record,'state',{status:'queued'});
  // A new question never waits for background compaction of its session: it is cancelled and redone later if needed.
  this.compactions.get(record.workspaceId+'/'+record.sessionId)?.abort();
  const task=this.queue.enqueue(record.workspaceId+'/'+record.sessionId,()=>this.perform(record,actor,controller.signal));this.tasks.set(record.id,task);
  const cleanup=()=>{this.modelLeases.get(record.id)?.release();this.modelLeases.delete(record.id);this.tasks.delete(record.id);this.controllers.delete(record.id);this.liveRecords.delete(record.id);};void task.then(cleanup,cleanup);return{runId:record.id};
 }
 private async perform(record:RunRecord,actor:Actor,signal:AbortSignal){
  if(terminal(record))return;
  let release:(()=>void)|undefined;let releaseModel:(()=>void)|undefined;
  try{
   signal.throwIfAborted();
   const initialScope:RunScope={actor:structuredClone(actor),workspaceId:record.workspaceId,sessionId:record.sessionId,runId:record.id,allowArtifactWrites:record.request.allowArtifactWrites,...(record.outputDirectory?{outputDirectory:record.outputDirectory}:{})};release=await this.dependencies.repository.registerScope(initialScope);
   record.status='running';await this.records.save(record);await this.records.emit(record,'state',{status:'running'});
   const model=this.modelLeases.get(record.id)!;releaseModel=model.release;
   const usageSession=await this.dependencies.repository.getSession(record.workspaceId,record.sessionId);
   await modelUsageScope.run({workspaceId:record.workspaceId,sessionId:record.sessionId,runId:record.id,epoch:usageSession.epoch??0},async()=>{
   await model.value.resolveCapabilities?.(signal);
   const envelope=await this.dependencies.context.build(record.request,signal,model.value,initialScope,{lease:model,progress:async value=>{await this.records.emit(record,'progress',value);}});record.contextRevision=envelope.mainRevision;record.context=envelope;await this.records.save(record);await this.records.emit(record,'context',{mainRevision:envelope.mainRevision,ownRevision:envelope.ownRevision,budget:envelope.budget,summaryCoverage:envelope.summaryCoverage});
   const sessionRecord=await this.dependencies.repository.getSession(record.workspaceId,record.sessionId);
   const readRevisions:Record<string,number>={[record.sessionId]:envelope.ownRevision??sessionRecord.revision};if(sessionRecord.parentMainSessionId)readRevisions[sessionRecord.parentMainSessionId]=envelope.mainRevision;
   const scope=await this.dependencies.repository.setReadRevisions(initialScope,readRevisions);
   if(envelope.memory)await this.dependencies.repository.saveOwnSummary(scope,envelope.memory);
   const session=await this.dependencies.repository.authorizeScope(scope);
   const definitions=this.dependencies.tools.list(scope.workspaceId).filter(tool=>session.kind==='main'||tool.effect==='read'||tool.effect==='write_artifact'&&scope.allowArtifactWrites);
   const tools=model.value.capabilities.tools?definitions.map(tool=>({type:'function' as const,function:{name:tool.name,description:tool.description,parameters:tool.inputSchema}})):[];
   // Deltas are stored as batched events; the partial answer copy is only refreshed periodically and on finish.
   let partialSavedAt=0;const stream=new DeltaBatcher((kind,data)=>this.records.emit(record,kind,data));
   const result=await toolLoop(model.value,envelope,tools,scope,this.executor,async(kind,data)=>{
    if(kind!=='delta'){await stream.event(kind,data);return;}
    const text=(data as {text:string}).text;record.partialText+=text;stream.delta(text);const now=Date.now();if(now-partialSavedAt>=PARTIAL_SAVE_INTERVAL_MS){partialSavedAt=now;await this.records.save(record);}
   },signal,record.request.reasoningEffort,async anchors=>{
    if(!model.value.capabilities.vision)throw new ReaderError('VISION_UNAVAILABLE','重看页面需要视觉模型');
    const messages:import('../../../contracts/src/models.js').ModelMessage[]=[];
    for(const anchor of anchors){if(anchor.location.kind!=='page'||!envelope.documents.some(ref=>ref.workspaceId===anchor.workspaceId&&ref.documentId===anchor.documentId&&ref.version===anchor.version))throw new ReaderError('TOOL_SCOPE_DENIED','重看页面越过本次文档权限',403);
     const image=await this.dependencies.documents.modelImage(anchor,anchor.location.page,signal);if(!image)throw new ReaderError('DOCUMENT_IMAGE_UNAVAILABLE','页面图像不可用');
     messages.push({role:'user',content:[{type:'text',text:'按需重看文档页：'+JSON.stringify(anchor)},{type:'image_url',image_url:{url:'data:'+image.mime+';base64,'+image.bytes.toString('base64')}}]});
    }
    validateImageRequest(messages,model.value.imageLimits??DEFAULT_IMAGE_LIMITS,{messages});return messages;
   }).finally(()=>stream.flush().catch(()=>{}));await stream.flush();signal.throwIfAborted();
   for(const anchor of envelope.sourceRanges)await this.records.emit(record,'citation',anchor);
   // History keeps the question and a bounded copy of its selection; the sources lead back to the full text.
   const content=clipMiddle(record.request.question,SELECTION_HISTORY_TOKENS,'\n…[问题原文较长，历史中只保留首尾]…\n')+(record.request.selection?'\n选区：'+clipMiddle(record.request.selection.text,SELECTION_HISTORY_TOKENS,'\n…[选区较长，历史中只保留首尾]…\n')+'\n来源：'+JSON.stringify(record.request.selection.anchors):'');
   signal.throwIfAborted();await this.dependencies.repository.completeOwnTurn(scope,{id:randomUUID(),runId:record.id,question:record.request.question,answer:result.answer,messages:[{role:'user',content},...result.ownMessages.map(withoutReasoning)],sourceAnchors:uniqueAnchors([...envelope.sourceRanges,...result.anchors]),attachmentIds:record.request.attachmentIds,...(record.request.selection?{selection:structuredClone(record.request.selection)}:{})},signal);
   record.result=result.answer;record.status='completed';this.scheduleCompaction(record,actor,usageSession.epoch??0);
   });
  }catch(error){record.status=signal.aborted?'cancelled':'failed';record.error=signal.aborted?new ReaderError('CANCELLED','本次回答已取消，部分输出未加入会话记忆').public():publicError(error);await this.records.emit(record,'error',record.error);}
  finally{release?.();releaseModel?.();await this.records.save(record);await this.records.emit(record,'state',{status:record.status});await this.records.prune(record.workspaceId,record.sessionId).catch(()=>{});}
 }
 /** After an answer, older turns of a long main session are summarized on the session queue while the user reads. */
 private scheduleCompaction(record:RunRecord,actor:Actor,epoch:number){
  const key=record.workspaceId+'/'+record.sessionId;this.compactions.get(key)?.abort();const controller=new AbortController();this.compactions.set(key,controller);
  void this.queue.enqueue(key,async()=>{
   if(controller.signal.aborted||this.closed)return;let model:CapabilityLease<ModelProvider>|undefined;
   try{
    model=this.dependencies.capabilities.acquire(record.workspaceId,'model',record.request.providerId);const lease=model;
    const summary=await modelUsageScope.run({workspaceId:record.workspaceId,sessionId:record.sessionId,runId:record.id,epoch},()=>this.dependencies.context.backgroundSummary(record.workspaceId,record.sessionId,record.request.providerId,lease.value,controller.signal));
    if(!summary||controller.signal.aborted)return;
    const scope:RunScope={actor:structuredClone(actor),workspaceId:record.workspaceId,sessionId:record.sessionId,runId:('compact-'+record.id) as RunId,allowArtifactWrites:false};
    const release=await this.dependencies.repository.registerScope(scope);try{await this.dependencies.repository.saveOwnSummary(scope,summary);}finally{release();}
   }catch{/* Best effort: the next question compacts before answering if history is still too long. */}
   finally{model?.release();if(this.compactions.get(key)===controller)this.compactions.delete(key);}
  }).catch(()=>{});
 }
 async get(workspaceId:WorkspaceId,id:RunId):Promise<RunRecord|DocumentJobRecord>{
  return this.recovery.enqueue(workspaceId+'/'+id,async()=>{
  let record:RunRecord;try{record=await this.records.get(workspaceId,id);}catch(error){if(error instanceof ReaderError&&error.code==='RUN_UNAVAILABLE')return this.dependencies.documents.jobs.get(workspaceId,id);throw error;}
  if(!terminal(record)&&!this.controllers.has(id)){record.status='failed';record.error=new ReaderError('RUN_INTERRUPTED','服务重启中断本次运行，请重新提问').public();await this.records.save(record);await this.records.emit(record,'error',record.error);await this.records.emit(record,'state',{status:'failed'});}return record;
  });
 }
 async readSavedEvents(workspaceId:WorkspaceId,id:RunId,afterSeq:number):Promise<RunEvent[]>{
  if(!Number.isSafeInteger(afterSeq)||afterSeq<0)throw new ReaderError('INVALID_CURSOR','事件序号无效');
  const record=await this.get(workspaceId,id);return record.kind==='document'?this.dependencies.documents.jobs.readEvents(workspaceId,id,afterSeq):this.records.readEvents(workspaceId,id,afterSeq);
 }
 async *events(workspaceId:WorkspaceId,id:RunId,afterSeq:number,signal:AbortSignal):AsyncIterable<RunEvent>{
  if(!Number.isSafeInteger(afterSeq)||afterSeq<0)throw new ReaderError('INVALID_CURSOR','事件序号无效');const record=await this.get(workspaceId,id);
  if(record.kind==='document'){yield* this.dependencies.documents.jobs.events(workspaceId,id,afterSeq,signal);return;}
  // Poll only the status column; fall back to the full record (which marks interrupted runs) when no task owns the run.
  const status=async()=>{const value=await this.records.status(workspaceId,id);return terminal({status:value})||this.controllers.has(id)?{status:value}:await this.get(workspaceId,id);};
  yield* replayEvents(status,after=>this.records.readEvents(workspaceId,id,after),afterSeq,signal,()=>this.records.waitForEvent(workspaceId,id,signal));
 }
 async cancel(workspaceId:WorkspaceId,id:RunId,actor:Actor):Promise<void>{
  const record=await this.get(workspaceId,id);if(record.kind==='document'){await this.dependencies.documents.jobs.cancel(workspaceId,id);return;}
  if(record.callerId!==actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','不能取消其他调用者运行',403);this.controllers.get(id)?.abort();
  const live=this.liveRecords.get(id);if(live?.status==='queued'){live.status='cancelled';live.error=new ReaderError('CANCELLED','排队请求已取消').public();this.modelLeases.get(id)?.release();this.modelLeases.delete(id);await this.records.save(live);await this.records.emit(live,'error',live.error);await this.records.emit(live,'state',{status:'cancelled'});return;}
  await this.tasks.get(id);
 }
 async close(){this.closed=true;for(const controller of [...this.controllers.values(),...this.compactions.values()])controller.abort();await Promise.allSettled([...this.tasks.values()]);await this.queue.idle();}
}
