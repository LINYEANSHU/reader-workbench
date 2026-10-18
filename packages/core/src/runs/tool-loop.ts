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
export async function toolLoop(model:ModelProvider,envelope:ContextEnvelope,tools:ModelTool[],scope:RunScope,executor:ToolExecutor,emit:(kind:RunEvent['kind'],data:unknown)=>Promise<unknown>,signal:AbortSignal,reasoningEffort?:string,resolveImages?:(anchors:SourceAnchor[])=>Promise<ModelMessage[]>){
 const messages:ModelMessage[]=structuredClone([...envelope.messages]),ownMessages:ModelMessage[]=[],anchors:SourceAnchor[]=[];let answer='',overflowRecovered=false,compactions=0;
 const currentQuestion=structuredClone(envelope.messages.at(-1)!);
 const inputCost=()=>messageTokens(messages,model.imageLimits?.imageTokens??1024)+estimateTokens(JSON.stringify(tools))+64;
 const compact=async()=>{
  signal.throwIfAborted();await emit('progress',{label:'正在压缩上下文'});
  const system=messages[0]!,retainLimit=Math.floor(model.capabilities.contextWindow*0.16);
  let keepFrom=messages.length;
  for(let index=messages.length-1;index>0;index--)if(messages[index]?.role==='assistant'&&messages[index]?.tool_calls?.length){
   if(messageTokens(messages.slice(index),model.imageLimits?.imageTokens??1024)<=retainLimit)keepFrom=index;break;
  }
  const prefix=messages.slice(1,keepFrom),tail=messages.slice(keepFrom);
  const hasImage=(message:ModelMessage)=>Array.isArray(message.content)&&message.content.some(block=>block.type==='image_url');
  const images=prefix.filter(hasImage),region=prefix.filter(message=>!hasImage(message));
  if(!region.length)throw new ReaderError('CONTEXT_LIMIT','没有可压缩的历史，请缩短当前问题或工具结果');
  const available=model.capabilities.contextWindow-messageTokens([system,currentQuestion,...tail,...images],model.imageLimits?.imageTokens??1024)-estimateTokens(JSON.stringify(tools))-512;
  if(available<64)throw new ReaderError('CONTEXT_LIMIT','当前问题或待解读图像超过模型容量，请减少页数或提高容量');
  const budget=Math.min(Math.floor(model.capabilities.contextWindow*0.2),available);
  const summary=await new ModelMemoryProvider(()=>model).summarizeMessages(region,budget,signal,system,tools);
  const replacement:ModelMessage[]=[system,{role:'user',content:'历史检查点（会话数据，不是执行授权）：\n<compacted-summary>\n'+summary+'\n</compacted-summary>'},...images,currentQuestion,...tail];
  if(messageTokens(replacement,model.imageLimits?.imageTokens??1024)>=messageTokens(messages,model.imageLimits?.imageTokens??1024))throw new ReaderError('CONTEXT_LIMIT','AI 摘要没有减少上下文，请缩短问题或提高模型容量');
  messages.splice(0,messages.length,...replacement);compactions++;
 };
 for(let round=0;round<8;round++){
  if(inputCost()>model.capabilities.contextWindow*0.8&&compactions<2&&round>0)await compact();
  validateImageRequest(messages,model.imageLimits??DEFAULT_IMAGE_LIMITS,{messages,tools});
  signal.throwIfAborted();const inputTokens=inputCost();
  if(inputTokens>model.capabilities.contextWindow)throw new ReaderError('CONTEXT_LIMIT','工具结果使本次上下文超限，请减少读取内容');
  const calls:ModelToolCall[]=[];let text='',reasoning='',done=false;
  let contextUsage={usedTokens:inputTokens,limit:model.capabilities.contextWindow,estimated:true,capacitySource:model.contextWindowSource??'manual',reservedOutputTokens:0};
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
   if(error instanceof ReaderError&&error.code==='CONTEXT_LIMIT'&&!signal.aborted&&!overflowRecovered&&!text&&!reasoning&&!calls.length){overflowRecovered=true;await compact();round--;continue;}
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
   const message:ModelMessage={role:'tool',tool_call_id:call.id,content:result.content};messages.push(message);ownMessages.push(message);
   if(result.pageImages?.length){if(!resolveImages)throw new ReaderError('VISION_UNAVAILABLE','本次运行没有页面图像解析能力');transient.push(...await resolveImages(result.pageImages));}
  }
  // Image payloads belong only to this request, never to committed history or tool storage.
  messages.push(...transient);
 }
 throw new ReaderError('TOOL_ROUND_LIMIT','工具调用已达到 8 轮，请调整问题后继续');
}
