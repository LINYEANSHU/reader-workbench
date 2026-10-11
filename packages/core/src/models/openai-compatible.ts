import type {ModelProvider} from '../../../sdk/src/capabilities.js';
import type {ModelSettings,ModelRequest,ModelEvent,ModelCapabilities} from '../../../contracts/src/models.js';
import type {CredentialStore} from '../runtime/credentials.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {parseSSE} from './sse-parser.js';
class CredentialRedactor{
 private pending='';constructor(private secret:string){}
 append(text:string,final=false):string{
  this.pending=(this.pending+text).replaceAll(this.secret,'[已隐藏凭据]');let hold=0;
  if(!final)for(let count=1;count<Math.min(this.secret.length,this.pending.length+1);count++)if(this.pending.endsWith(this.secret.slice(0,count)))hold=count;
  const result=this.pending.slice(0,this.pending.length-hold);this.pending=this.pending.slice(this.pending.length-hold);return result;
 }
}
export function completionUrl(baseUrl:string):string{
 let url:URL;try{url=new URL(baseUrl);}catch{throw new ReaderError('MODEL_URL_INVALID','模型 API 地址无效');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new ReaderError('MODEL_URL_INVALID','模型地址必须为没有凭据和查询参数的 HTTP/HTTPS 地址');
 const path=url.pathname.replace(/\/+$/,'');url.pathname=path.endsWith('/chat/completions')?path:path+'/chat/completions';return url.toString();
}
export class OpenAICompatibleProvider implements ModelProvider{
 readonly capabilities:ModelCapabilities;readonly ocrToolId?:string;private settings:ModelSettings;private key:Promise<string>;private endpoint:string;
 constructor(settings:ModelSettings,credentials:CredentialStore){
  this.settings=structuredClone(settings);this.capabilities=Object.freeze(structuredClone(settings.capabilities));this.ocrToolId=settings.ocrToolId;this.endpoint=completionUrl(settings.baseUrl);
  this.key=credentials.getSecret(settings.credentialRef);void this.key.catch(()=>{});
 }
 async *generate(request:ModelRequest,signal:AbortSignal):AsyncIterable<ModelEvent>{
  signal.throwIfAborted();const capabilities=this.capabilities,settings=this.settings;
  if(request.tools.length&&!capabilities.tools)throw new ReaderError('MODEL_TOOLS_UNSUPPORTED','此模型未启用工具调用');
  const images=request.messages.flatMap(message=>typeof message.content==='string'?[]:message.content.filter(item=>item.type==='image_url'));
  if(images.length&&!capabilities.vision)throw new ReaderError('VISION_UNAVAILABLE','所选模型不支持图像，请选择视觉模型或配置 OCR');
  let imageBytes=0;for(const image of images){const match=/^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(image.type==='image_url'?image.image_url.url:'');if(!match)throw new ReaderError('IMAGE_INVALID','仅接受工作区中已验证的图像数据');const bytes=Buffer.from(match[1]!,'base64').length;imageBytes+=bytes;if(bytes>4*1024*1024)throw new ReaderError('IMAGE_CONTEXT_LIMIT','单张图像超过 4 MiB');}
  if(images.length>4||imageBytes>12*1024*1024)throw new ReaderError('IMAGE_CONTEXT_LIMIT','每次最多 4 张图像，总大小不超过 12 MiB');
  const effort=request.reasoningEffort??capabilities.defaultReasoningEffort;
  if(effort!==undefined&&!capabilities.reasoningEfforts?.includes(effort))throw new ReaderError('REASONING_UNSUPPORTED','所选模型不支持此思考档位');
  if(!Number.isSafeInteger(request.maxOutputTokens)||request.maxOutputTokens<1||request.maxOutputTokens>capabilities.maxOutputTokens)throw new ReaderError('MODEL_OUTPUT_LIMIT','输出容量设置超出所选模型范围');
  const key=await this.key;signal.throwIfAborted();
  const body:Record<string,unknown>={model:settings.model,messages:structuredClone(request.messages),stream:true,stream_options:{include_usage:true},max_tokens:request.maxOutputTokens};
  if(request.tools.length)body.tools=structuredClone(request.tools);
  if(effort!==undefined){body.reasoning_effort=effort;if(settings.reasoningFormat==='deepseek')body.thinking={type:effort==='none'?'disabled':'enabled'};}
  const networkSignal=AbortSignal.any([signal,AbortSignal.timeout(settings.requestTimeoutMs??180000)]);
  let response:Response;
  try{response=await fetch(this.endpoint,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json',accept:'text/event-stream'},body:JSON.stringify(body),signal:networkSignal,redirect:'error'});}
  catch(error){if(signal.aborted)throw signal.reason;if(networkSignal.aborted)throw new ReaderError('MODEL_TIMEOUT','模型请求超时，请降低思考深度或增加超时设置',504,true);throw new ReaderError('MODEL_CONNECTION_FAILED','无法连接模型 API，请检查地址与网络',502,true);}
  if(!response.ok){
   let code='';try{code=(await response.json() as {error?:{code?:string}}).error?.code??'';}catch{}
   if(response.status===401||response.status===403)throw new ReaderError('MODEL_AUTHENTICATION_FAILED','模型 API 凭据无效或无权限',401);
   if(response.status===429)throw new ReaderError('MODEL_RATE_LIMIT','模型 API 请求过于频繁或额度不足，请稍后重试',429,true);
   if(code==='context_length_exceeded'||code==='context_window_exceeded')throw new ReaderError('CONTEXT_LIMIT','模型端拒绝了超出容量的上下文',400);
   throw new ReaderError('MODEL_API_ERROR','模型 API 拒绝请求（HTTP '+response.status+'）',502,response.status>=500);
  }
  if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw new ReaderError('MODEL_STREAM_INVALID','模型 API 未返回流式事件',502);
  const calls=new Map<number,{id:string;name:string;arguments:string}>();let complete=false,finish:string|null=null;const textRedactor=new CredentialRedactor(key),reasoningRedactor=new CredentialRedactor(key);
  try{
   for await(const event of parseSSE(response.body,networkSignal)){
    if(event.data.trim()==='[DONE]'){complete=true;break;}
    let chunk:{error?:unknown;choices?:Array<{delta?:{content?:string;reasoning_content?:string;tool_calls?:Array<{index:number;id?:string;function?:{name?:string;arguments?:string}}>} ;finish_reason?:string|null}>;usage?:{prompt_tokens?:number;completion_tokens?:number}};
    try{chunk=JSON.parse(event.data);}catch{throw new ReaderError('MODEL_STREAM_INVALID','模型事件不是有效 JSON',502);}
    if(chunk.error)throw new ReaderError('MODEL_API_ERROR','模型在流式过程中报告错误',502);
    const choice=chunk.choices?.[0],delta=choice?.delta;if(choice?.finish_reason)finish=choice.finish_reason;
    if(typeof delta?.content==='string'&&delta.content){const text=textRedactor.append(delta.content);if(text)yield{kind:'delta',text};}
    if(typeof delta?.reasoning_content==='string'&&delta.reasoning_content){const text=reasoningRedactor.append(delta.reasoning_content);if(text)yield{kind:'reasoning',text};}
    for(const item of delta?.tool_calls??[]){
     if(!Number.isSafeInteger(item.index)||item.index<0||item.index>31)throw new ReaderError('TOOL_INPUT_INVALID','模型工具索引无效');const call=calls.get(item.index)??{id:'',name:'',arguments:''};
     if(item.id)call.id=item.id;if(item.function?.name)call.name+=item.function.name;if(item.function?.arguments)call.arguments+=item.function.arguments;
     if(call.arguments.length>1024*1024)throw new ReaderError('TOOL_INPUT_INVALID','模型工具参数过大');calls.set(item.index,call);
    }
    if(chunk.usage)yield{kind:'usage',inputTokens:chunk.usage.prompt_tokens??0,outputTokens:chunk.usage.completion_tokens??0};
   }
  }catch(error){if(signal.aborted)throw signal.reason;if(networkSignal.aborted)throw new ReaderError('MODEL_TIMEOUT','模型流超时',504,true);if(error instanceof ReaderError)throw error;throw new ReaderError('MODEL_STREAM_INTERRUPTED','模型流连接中断，部分输出未加入记忆',502,true);}
  const finalText=textRedactor.append('',true),finalReasoning=reasoningRedactor.append('',true);if(finalText)yield{kind:'delta',text:finalText};if(finalReasoning)yield{kind:'reasoning',text:finalReasoning};
  if(finish==='length')throw new ReaderError('MODEL_OUTPUT_LIMIT','模型达到输出上限，回答未完整完成');
  if(finish==='content_filter')throw new ReaderError('MODEL_REPLY_BLOCKED','模型未完成本次回答');
  if(!complete&&!finish)throw new ReaderError('MODEL_STREAM_INTERRUPTED','模型流缺少完成信号',502,true);
  for(const [,call] of [...calls].sort((a,b)=>a[0]-b[0])){let input:unknown;try{input=JSON.parse(call.arguments);}catch{throw new ReaderError('TOOL_INPUT_INVALID','模型工具参数 JSON 不完整，未执行');}if(!call.id||!call.name||!input||typeof input!=='object'||Array.isArray(input))throw new ReaderError('TOOL_INPUT_INVALID','模型工具参数无效');if(call.id.includes(key)||call.name.includes(key)||JSON.stringify(input).includes(key))throw new ReaderError('MODEL_SECRET_REFLECTED','模型返回中含服务端凭据，工具未执行',502);yield{kind:'tool-call',id:call.id,name:call.name,input};}
  yield{kind:'done'};
 }
}
