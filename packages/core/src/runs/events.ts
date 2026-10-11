import {setTimeout as delay} from 'node:timers/promises';
import type {RunEvent,RunRecord} from '../../../contracts/src/runs.js';
export const terminal=(record:{status:string})=>['completed','failed','cancelled'].includes(record.status);
export async function* replayEvents(get:()=>Promise<RunRecord>,read:(after:number)=>Promise<RunEvent[]>,after:number,signal:AbortSignal):AsyncIterable<RunEvent>{
 let cursor=after;
 try{while(!signal.aborted){const record=await get();for(const event of await read(cursor)){cursor=event.seq;yield event;}if(terminal(record))return;await delay(25,undefined,{signal});}}
 catch(error){if(!signal.aborted)throw error;}
}
