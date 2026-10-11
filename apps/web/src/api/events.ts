import type {RunId,WorkspaceId} from '../../../../packages/contracts/src/ids.js';import type {RunEvent} from '../../../../packages/contracts/src/runs.js';
export async function subscribeRun(runId:RunId,workspaceId:WorkspaceId,afterSeq:number,onEvent:(event:RunEvent)=>void,signal:AbortSignal):Promise<void>{
 let cursor=afterSeq,attempt=0;
 while(!signal.aborted){
  try{
   const response=await fetch('/api/v1/runs/'+runId+'/events?workspaceId='+workspaceId+'&afterSeq='+cursor,{credentials:'same-origin',signal});if(!response.ok)throw new Error('运行事件连接失败（'+response.status+'）');
   const reader=response.body!.getReader(),decoder=new TextDecoder();let pending='';
   try{for(;;){const part=await reader.read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true}).replaceAll('\r','');if(pending.length>24*1024*1024)throw new Error('事件内容超过大小限制');let end;
    while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data)continue;const event=JSON.parse(data) as RunEvent;if(event.seq<=cursor)continue;cursor=event.seq;onEvent(event);attempt=0;if(event.kind==='state'&&['completed','failed','cancelled'].includes((event.data as {status:string}).status))return;}
   }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch(error){if(signal.aborted)return;if(++attempt>5)throw error;}
  await new Promise<void>(resolve=>{const timer=setTimeout(finish,Math.min(5000,400*2**attempt));function finish(){clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();}signal.addEventListener('abort',finish,{once:true});});
 }
}
