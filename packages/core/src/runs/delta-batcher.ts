import type {RunEvent} from '../../../contracts/src/runs.js';
export const DELTA_EVENT_INTERVAL_MS=50;
/**
 * Streamed text is stored and pushed as one event per interval instead of one per token (each event is a database
 * write). Text is flushed by a timer, so a pausing model still shows what it has written, and before any other event,
 * so readers see events in the order the model produced them.
 */
export class DeltaBatcher{
 private pending='';private timer:ReturnType<typeof setTimeout>|undefined;private chain:Promise<unknown>=Promise.resolve();
 constructor(private emit:(kind:RunEvent['kind'],data:unknown)=>Promise<unknown>,private interval=DELTA_EVENT_INTERVAL_MS){}
 private enqueue(task:()=>Promise<unknown>){this.chain=this.chain.then(task);return this.chain;}
 delta(text:string){this.pending+=text;this.timer??=setTimeout(()=>{this.timer=undefined;void this.flush().catch(()=>{});},this.interval);}
 flush():Promise<unknown>{if(this.timer){clearTimeout(this.timer);this.timer=undefined;}if(!this.pending)return this.chain;const text=this.pending;this.pending='';return this.enqueue(()=>this.emit('delta',{text}));}
 async event(kind:RunEvent['kind'],data:unknown){await this.flush();await this.enqueue(()=>this.emit(kind,data));}
}
