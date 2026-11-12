import {setTimeout as delay} from 'node:timers/promises';
import type {RunEvent} from '../../../contracts/src/runs.js';
export const terminal=(record:{status:string})=>['completed','failed','cancelled'].includes(record.status);
/** A wake-up armed before reading, so an event appended in between is never missed. */
export interface EventWait {wait:Promise<void>;cancel():void}
export async function* replayEvents(get:()=>Promise<{status:string}>,read:(after:number)=>Promise<RunEvent[]>,after:number,signal:AbortSignal,arm?:()=>EventWait):AsyncIterable<RunEvent>{
 let cursor=after;
 try{while(!signal.aborted){
  const next=arm?.();
  try{
   const record=await get();for(const event of await read(cursor)){cursor=event.seq;yield event;}if(terminal(record))return;
   if(next)await next.wait;else await delay(25,undefined,{signal});
  }finally{next?.cancel();}
 }}
 catch(error){if(!signal.aborted)throw error;}
}
