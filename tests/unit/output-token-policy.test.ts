import {expect,it} from 'vitest';
import {ModelMemoryProvider} from '../../packages/core/src/sessions/memory.js';
import {inputOnlyCapabilities} from '../../packages/contracts/src/models.js';

it('keeps normalized model capabilities independent of later settings edits',()=>{
 const settings={vision:true,tools:true,contextWindow:32000,maxOutputTokens:512,reasoningEfforts:['none','high']};
 const capabilities=inputOnlyCapabilities(settings);settings.reasoningEfforts.push('max');
 expect(capabilities.reasoningEfforts).toEqual(['none','high']);
 expect(capabilities.contextWindow).toBe(1000000);expect(capabilities).not.toHaveProperty('maxOutputTokens');
});

it('lets the provider choose compaction output length even with an old saved output limit',async()=>{
 const requests:any[]=[];
 const model:any={capabilities:{vision:false,tools:false,contextWindow:1000000,maxOutputTokens:1},async *generate(request:any){requests.push(request);yield{kind:'delta',text:'保存的检查点'};yield{kind:'done'};}};
 await new ModelMemoryProvider(()=>model).summarizeMessages([{role:'user',content:'保留用户目标'}],2000,new AbortController().signal);
 expect(requests).toHaveLength(1);
 expect(requests[0]).not.toHaveProperty('maxOutputTokens');
});

it('tightens the compression instruction when a summary exceeds its downstream input allocation',async()=>{
 const requests:any[]=[];
 const model:any={capabilities:{vision:false,tools:false,contextWindow:1000000},async *generate(request:any){requests.push(request);yield{kind:'delta',text:requests.length===1?'冗长的检查点'.repeat(1000):'精简的检查点'};yield{kind:'done'};}};
 await new ModelMemoryProvider(()=>model).summarizeMessages([{role:'user',content:'历史会话'}],2000,new AbortController().signal);
 expect(requests).toHaveLength(2);
 expect(requests[1].messages.at(-1).content).not.toBe(requests[0].messages.at(-1).content);
 for(const request of requests)expect(request).not.toHaveProperty('maxOutputTokens');
});
