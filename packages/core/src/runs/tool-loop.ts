import type {ModelProvider} from '../../../sdk/src/capabilities.js';
import type {ModelMessage,ModelTool,ModelToolCall} from '../../../contracts/src/models.js';
import type {ContextEnvelope} from '../../../contracts/src/sessions.js';
import type {RunScope} from '../../../contracts/src/ids.js';
import type {SourceAnchor} from '../../../contracts/src/documents.js';
import type {RunEvent} from '../../../contracts/src/runs.js';
import type {ToolExecutor} from '../tools/executor.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {estimateTokens} from '../sessions/context.js';
export async function toolLoop(model:ModelProvider,envelope:ContextEnvelope,tools:ModelTool[],scope:RunScope,executor:ToolExecutor,emit:(kind:RunEvent['kind'],data:unknown)=>Promise<unknown>,signal:AbortSignal,reasoningEffort?:string){
 const messages:ModelMessage[]=structuredClone([...envelope.messages]),ownMessages:ModelMessage[]=[],anchors:SourceAnchor[]=[];let answer='';
 for(let round=0;round<8;round++){
  signal.throwIfAborted();const inputTokens=messages.reduce((total,message)=>total+24+(typeof message.content==='string'?estimateTokens(message.content):message.content.reduce((sum,item)=>sum+(item.type==='text'?estimateTokens(item.text):1024),0))+(message.tool_calls?estimateTokens(JSON.stringify(message.tool_calls)):0)+(message.reasoning_content?estimateTokens(message.reasoning_content):0),0)+estimateTokens(JSON.stringify(tools))+64;
  if(inputTokens+envelope.budget.reservedOutputTokens>model.capabilities.contextWindow)throw new ReaderError('CONTEXT_LIMIT','工具结果使本次上下文超限，请减少读取内容');
  const calls:ModelToolCall[]=[];let text='',reasoning='',done=false;
  for await(const event of model.generate({messages:structuredClone(messages),tools,maxOutputTokens:envelope.budget.reservedOutputTokens,reasoningEffort},signal)){
   signal.throwIfAborted();
   if(event.kind==='delta'){text+=event.text;answer+=event.text;await emit('delta',{text:event.text});}
   else if(event.kind==='reasoning'){if(!reasoning)await emit('progress',{label:'正在思考'});reasoning+=event.text;}
   else if(event.kind==='tool-call'){
    if(!model.capabilities.tools)throw new ReaderError('MODEL_TOOLS_UNSUPPORTED','该模型未声明工具调用能力');
    if(!event.id||!event.name||typeof event.input!=='object'||event.input===null)throw new ReaderError('TOOL_INPUT_INVALID','工具调用参数无效');
    if(calls.some(call=>call.id===event.id))throw new ReaderError('TOOL_CALL_DUPLICATE','同轮工具调用标识重复');
    calls.push({id:event.id,type:'function',function:{name:event.name,arguments:JSON.stringify(event.input)}});
   }else if(event.kind==='done')done=true;
  }
  if(!done)throw new ReaderError('MODEL_STREAM_INTERRUPTED','模型流在完成信号前中断',502,true);
  const assistant:ModelMessage={role:'assistant',content:text,...(reasoning?{reasoning_content:reasoning}:{}),...(calls.length?{tool_calls:calls}:{})};messages.push(assistant);ownMessages.push(assistant);
  if(!calls.length){if(!answer.trim())throw new ReaderError('MODEL_EMPTY_REPLY','模型没有返回回答');return{answer,ownMessages,anchors};}
  for(const call of calls){
   await emit('tool-start',{id:call.id,name:call.function.name});
   const result=await executor.execute(call.function.name,JSON.parse(call.function.arguments),scope,scope.runId+':'+call.id,signal);
   await emit('tool-result',{id:call.id,name:call.function.name,result});
   for(const anchor of result.sourceAnchors??[]){anchors.push(anchor);await emit('citation',anchor);}
   for(const artifactId of result.artifactIds??[])await emit('artifact',{id:artifactId});
   const message:ModelMessage={role:'tool',tool_call_id:call.id,content:result.content};messages.push(message);ownMessages.push(message);
  }
 }
 throw new ReaderError('TOOL_ROUND_LIMIT','工具调用已达到 8 轮，请调整问题后继续');
}
