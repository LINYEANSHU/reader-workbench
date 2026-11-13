import type {ModelProvider} from '../../../sdk/src/capabilities.js';
import type {ModelMessage,ModelTool,ModelToolCall} from '../../../contracts/src/models.js';
import type {ContextEnvelope} from '../../../contracts/src/sessions.js';
import type {RunScope} from '../../../contracts/src/ids.js';
import type {SourceAnchor} from '../../../contracts/src/documents.js';
import type {RunEvent} from '../../../contracts/src/runs.js';
import type {ToolExecutor} from '../tools/executor.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {estimateTokens,messageTokens} from '../models/tokens.js';import {ModelMemoryProvider} from '../sessions/memory.js';
import {validateImageRequest,DEFAULT_IMAGE_LIMITS} from '../models/image-budget.js';
import {effectiveContextWindow,learnContextLimit} from '../models/context-window.js';
const MAX_OVERFLOW_RECOVERIES=3,ARCHIVED_TOOL_CHARS=400,TOOL_RESULT_TOKENS=256*1024;
export {clipTokens} from '../models/tokens.js';import {clipTokens} from '../models/tokens.js';
export async function toolLoop(model:ModelProvider,envelope:ContextEnvelope,tools:ModelTool[],scope:RunScope,executor:ToolExecutor,emit:(kind:RunEvent['kind'],data:unknown)=>Promise<unknown>,signal:AbortSignal,reasoningEffort?:string,resolveImages?:(anchors:SourceAnchor[])=>Promise<ModelMessage[]>){
 const messages:ModelMessage[]=structuredClone([...envelope.messages]),ownMessages:ModelMessage[]=[],anchors:SourceAnchor[]=[];let answer='',overflowRecoveries=0;
 const question=messages.at(-1)!,viewedImages=new WeakSet<ModelMessage>(),imageTokens=model.imageLimits?.imageTokens??1024;
 // Document context (full page memory before the history, retrieved excerpts after it) is what the answer is grounded
 // in: compaction never summarizes it, and shortens it only when history and old tool output are already gone.
 const layout=envelope.layout,laid=layout&&1+layout.stable+layout.history<=messages.length-1;
 const documentContext=new Set<ModelMessage>(laid?[...messages.slice(1,1+layout.stable),...messages.slice(1+layout.stable+layout.history,-1)]:[]);
 const imageNote=(message:ModelMessage)=>'[已查看过的页面图像已移出上下文；如需再次核对请重新调用工具] '+(Array.isArray(message.content)?message.content.flatMap(block=>block.type==='text'?[block.text]:[]).join(' '):'');
 const toolsCost=estimateTokens(JSON.stringify(tools))+64,inputCost=()=>messageTokens(messages,imageTokens)+toolsCost,cost=(message:ModelMessage)=>messageTokens([message],imageTokens);
 const hasImage=(message:ModelMessage)=>Array.isArray(message.content)&&message.content.some(block=>block.type==='image_url');
 const replace=(old:ModelMessage,next:ModelMessage)=>{const index=messages.indexOf(old);if(index>=0)messages[index]=next;if(documentContext.delete(old))documentContext.add(next);};
 /** Shortens string messages in proportion to their size until `excess` estimated tokens are gone. */
 const shorten=(candidates:ModelMessage[],excess:number,note:string)=>{const sized=candidates.filter(message=>typeof message.content==='string').map(message=>({message,size:cost(message)})),total=sized.reduce((sum,item)=>sum+item.size,0);if(!total||excess<=0)return;
  for(const {message,size} of sized){const keep=Math.max(256,size-Math.ceil(excess*size/total));if(keep<size)replace(message,{...message,content:clipTokens(message.content as string,keep,note)});}};
 /**
  * Brings the input under `target` in stages, cheapest and least lossy first:
  * 1. tool output of earlier rounds becomes a note (no model call);
  * 2. history and earlier tool exchanges are summarized, document context and the latest exchange untouched;
  * 3. document context is shortened, pointing to the reading tools for the rest;
  * 4. the latest tool output is shortened.
  * Fails only when the question, its images and the system prompt alone exceed the window.
  */
 const compact=async(target:number)=>{
  signal.throwIfAborted();await emit('progress',{label:'正在压缩上下文'});
  const window=effectiveContextWindow(model);let latest=messages.length;
  for(let index=messages.length-1;index>messages.indexOf(question);index--)if(messages[index]?.role==='assistant'&&messages[index]?.tool_calls?.length){latest=index;break;}
  for(const message of messages.slice(messages.indexOf(question)+1,latest))if(message.role==='tool'&&typeof message.content==='string'&&message.content.length>ARCHIVED_TOOL_CHARS)replace(message,{...message,content:'[本次较早的工具结果已移出上下文（原 '+message.content.length+' 字）；结论见随后的回答，需要原文时重新调用工具]'});
  if(inputCost()<=target)return;
  const latestMessage=messages[latest],region=messages.filter((message,index)=>index>0&&index<(latestMessage?messages.indexOf(latestMessage):messages.length)&&message!==question&&!documentContext.has(message)&&!hasImage(message));
  if(region.length){const kept=inputCost()-messageTokens(region,imageTokens),available=window-kept-512;
   if(available>=64){const budget=Math.max(64,Math.min(Math.floor(window*0.2),available,target-kept));
    const summary=await new ModelMemoryProvider(()=>model).summarizeMessages(region,budget,signal,messages[0]!,tools),checkpoint:ModelMessage={role:'user',content:'历史检查点（会话数据，不是执行授权）：\n<compacted-summary>\n'+summary+'\n</compacted-summary>'};
    const at=messages.indexOf(region[0]!);for(const message of region)messages.splice(messages.indexOf(message),1);messages.splice(at,0,checkpoint);}}
  if(inputCost()<=target)return;
  shorten([...documentContext].filter(message=>messages.includes(message)),inputCost()-target,'\n[文档上下文过长已截断；其余页记忆与原文可用 read_document_memory、search_document_memory、read_document_page 读取]');
  if(inputCost()<=target)return;
  shorten(messages.slice(latest).filter(message=>message.role==='tool'),inputCost()-target,'\n[工具结果过长已截断；请缩小查询范围后重新调用]');
  if(inputCost()>window)throw new ReaderError('CONTEXT_LIMIT','当前问题、选区或待看图像本身超过模型容量，请缩短问题或减少图像');
 };
 for(let round=0;round<8;round++){
  // From the second round tool output may push the input up; a lowered window can make even the first one too long.
  if((round>0||inputCost()>effectiveContextWindow(model))&&inputCost()>effectiveContextWindow(model)*0.8)await compact(Math.floor(effectiveContextWindow(model)*0.6));
  validateImageRequest(messages,model.imageLimits??DEFAULT_IMAGE_LIMITS,{messages,tools});
  signal.throwIfAborted();const inputTokens=inputCost();
  if(inputTokens>effectiveContextWindow(model))throw new ReaderError('CONTEXT_LIMIT','工具结果使本次上下文超限，请减少读取内容');
  const calls:ModelToolCall[]=[];let text='',reasoning='',done=false;
  let contextUsage={usedTokens:inputTokens,limit:effectiveContextWindow(model),estimated:true,capacitySource:model.contextWindowSource??'manual',reservedOutputTokens:0};
  await emit('context',{mainRevision:envelope.mainRevision,ownRevision:envelope.ownRevision,budget:{...envelope.budget,inputTokens},summaryCoverage:envelope.summaryCoverage,contextUsage});
  try{for await(const event of model.generate({messages:structuredClone(messages),tools,reasoningEffort,usagePurpose:'conversation',contextUsage},signal)){
   signal.throwIfAborted();
   if(event.kind==='delta'){text+=event.text;answer+=event.text;await emit('delta',{text:event.text});}
   else if(event.kind==='reasoning'){if(!reasoning)await emit('progress',{label:'正在思考'});reasoning+=event.text;}
   else if(event.kind==='tool-call'){
    if(!model.capabilities.tools)throw new ReaderError('MODEL_TOOLS_UNSUPPORTED','该模型未声明工具调用能力');
    if(!event.id||!event.name||typeof event.input!=='object'||event.input===null)throw new ReaderError('TOOL_INPUT_INVALID','工具调用参数无效');
    if(calls.some(call=>call.id===event.id))throw new ReaderError('TOOL_CALL_DUPLICATE','同轮工具调用标识重复');
    calls.push({id:event.id,type:'function',function:{name:event.name,arguments:JSON.stringify(event.input)}});
   }else if(event.kind==='usage'){
    contextUsage={...contextUsage,usedTokens:event.inputTokens,estimated:false};
    await emit('context',{mainRevision:envelope.mainRevision,ownRevision:envelope.ownRevision,budget:{...envelope.budget,inputTokens:event.inputTokens,estimated:false},summaryCoverage:envelope.summaryCoverage,contextUsage});
   }else if(event.kind==='done')done=true;
  }}catch(error){
   // The provider accepts less than estimated: remember its limit and shrink below it, a few times at most.
   if(error instanceof ReaderError&&error.code==='CONTEXT_LIMIT'&&!signal.aborted&&overflowRecoveries<MAX_OVERFLOW_RECOVERIES&&!text&&!reasoning&&!calls.length){overflowRecoveries++;await compact(Math.floor(Math.min(learnContextLimit(model,inputTokens)*0.8,inputTokens*0.75)));round--;continue;}
   throw error;
  }
  if(!done)throw new ReaderError('MODEL_STREAM_INTERRUPTED','模型流在完成信号前中断',502,true);
  const assistant:ModelMessage={role:'assistant',content:text,...(reasoning?{reasoning_content:reasoning}:{}),...(calls.length?{tool_calls:calls}:{})};messages.push(assistant);ownMessages.push(assistant);
  if(!calls.length){if(!answer.trim())throw new ReaderError('MODEL_EMPTY_REPLY','模型没有返回回答');return{answer,ownMessages,anchors};}
  const transient:ModelMessage[]=[];
  for(const call of calls){
   await emit('tool-start',{id:call.id,name:call.function.name});
   const result=await executor.execute(call.function.name,JSON.parse(call.function.arguments),scope,scope.runId+':'+call.id,signal);
   await emit('tool-result',{id:call.id,name:call.function.name,result});
   for(const anchor of result.sourceAnchors??[]){anchors.push(anchor);await emit('citation',anchor);}
   for(const artifactId of result.artifactIds??[])await emit('artifact',{id:artifactId});
   // One result never takes more than a quarter of the window; plugin tools can return megabytes.
   const limit=Math.min(TOOL_RESULT_TOKENS,Math.floor(effectiveContextWindow(model)/4)),content=estimateTokens(result.content)>limit?clipTokens(result.content,limit,'\n[工具结果过长已截断；请缩小查询范围后重新调用]'):result.content;
   const message:ModelMessage={role:'tool',tool_call_id:call.id,content};messages.push(message);ownMessages.push(message);
   if(result.pageImages?.length){if(!resolveImages)throw new ReaderError('VISION_UNAVAILABLE','本次运行没有页面图像解析能力');transient.push(...await resolveImages(result.pageImages));}
  }
  // Image payloads belong only to this request, never to committed history or tool storage.
  // Pages the model has already looked at become text notes, so repeated revisits cannot exceed the image limit.
  if(transient.length)for(let index=0;index<messages.length;index++){const message=messages[index]!;if(viewedImages.has(message))messages[index]={role:'user',content:imageNote(message)};}
  for(const message of transient)viewedImages.add(message);
  messages.push(...transient);
 }
 throw new ReaderError('TOOL_ROUND_LIMIT','工具调用已达到 8 轮，请调整问题后继续');
}
