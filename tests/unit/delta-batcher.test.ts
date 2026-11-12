import {expect,it} from 'vitest';
import {setTimeout as delay} from 'node:timers/promises';
import {DeltaBatcher} from '../../packages/core/src/runs/delta-batcher.js';
const recorder=()=>{const events:Array<[string,unknown]>=[];return{events,emit:async(kind:string,data:unknown)=>{await delay(1);events.push([kind,data]);}};};
it('writes a burst of tokens as one event and flushes text before any other event',async()=>{
 const {events,emit}=recorder(),batcher=new DeltaBatcher(emit as never,1000);
 for(const text of ['信','道','容','量'])batcher.delta(text);
 await batcher.event('tool-start',{name:'read'});batcher.delta('！');await batcher.flush();
 expect(events).toEqual([['delta',{text:'信道容量'}],['tool-start',{name:'read'}],['delta',{text:'！'}]]);
});
it('flushes on a timer so text written before a model pause is not held back',async()=>{
 const {events,emit}=recorder(),batcher=new DeltaBatcher(emit as never,20);
 batcher.delta('A');await delay(80);expect(events).toEqual([['delta',{text:'A'}]]);
 await batcher.flush();expect(events).toHaveLength(1);
});
it('reports a failed write to the next caller instead of dropping it',async()=>{
 const batcher=new DeltaBatcher(async()=>{throw new Error('disk full');},1000);
 batcher.delta('x');await expect(batcher.flush()).rejects.toThrow('disk full');await expect(batcher.event('progress',{})).rejects.toThrow('disk full');
});
