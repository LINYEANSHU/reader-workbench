import {ReaderError} from '../../../contracts/src/errors.js';
export interface ServerSentEvent{event?:string;id?:string;data:string}
export async function* parseSSE(body:ReadableStream<Uint8Array>,signal:AbortSignal):AsyncIterable<ServerSentEvent>{
 const reader=body.getReader(),decoder=new TextDecoder();let pending='',data:string[]=[],event:string|undefined,id:string|undefined,size=0;
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{for(;;){signal.throwIfAborted();const chunk=await reader.read();signal.throwIfAborted();pending+=decoder.decode(chunk.value,{stream:!chunk.done});
  if(pending.length>2*1024*1024)throw new ReaderError('MODEL_STREAM_INVALID','模型事件过大');
  let newline:number;while((newline=pending.indexOf('\n'))>=0){let line=pending.slice(0,newline);pending=pending.slice(newline+1);if(line.endsWith('\r'))line=line.slice(0,-1);
   if(!line){if(data.length)yield{event,id,data:data.join('\n')};data=[];event=undefined;size=0;continue;}
   if(line.startsWith(':'))continue;const colon=line.indexOf(':'),field=colon<0?line:line.slice(0,colon);let value=colon<0?'':line.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
   if(field==='data'){size+=value.length;if(size>2*1024*1024)throw new ReaderError('MODEL_STREAM_INVALID','模型事件过大');data.push(value);}else if(field==='event')event=value;else if(field==='id'&&!value.includes('\0'))id=value;
  }
  if(chunk.done)break;
 }}finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
