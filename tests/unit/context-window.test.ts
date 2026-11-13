import {afterEach,expect,it} from 'vitest';
import {effectiveContextWindow,learnContextLimit,isContextOverflow,resetLearnedContextLimits} from '../../packages/core/src/models/context-window.js';
import {toolLoop} from '../../packages/core/src/runs/tool-loop.js';
import {ReaderError} from '../../packages/contracts/src/errors.js';
afterEach(()=>resetLearnedContextLimits());
it('recognizes overflow rejections however providers word them',()=>{
 expect(isContextOverflow(400,'invalid_request_error',"This model's maximum context length is 131072 tokens. However, you requested 245760 tokens.")).toBe(true);
 expect(isContextOverflow(400,'context_length_exceeded','')).toBe(true);expect(isContextOverflow(413,'','Request Entity Too Large')).toBe(true);
 expect(isContextOverflow(400,'','Input is too long for requested model.')).toBe(true);expect(isContextOverflow(400,'','prompt is too long: 210000 tokens > 200000 maximum')).toBe(true);
 expect(isContextOverflow(400,'invalid_api_key','Incorrect API key provided')).toBe(false);expect(isContextOverflow(400,'','Invalid image URL')).toBe(false);
});
it('lowers the window of a model below an input its provider rejected, never below a working minimum',()=>{
 const model={identity:'m',capabilities:{vision:false,tools:false,contextWindow:1_000_000}};
 expect(effectiveContextWindow(model)).toBe(1_000_000);expect(learnContextLimit(model,400_000)).toBe(300_000);expect(effectiveContextWindow(model)).toBe(300_000);
 learnContextLimit(model,900_000);expect(effectiveContextWindow(model)).toBe(225_000);learnContextLimit(model,10);expect(effectiveContextWindow(model)).toBe(4096);
 expect(effectiveContextWindow({identity:'other',capabilities:model.capabilities})).toBe(1_000_000);
});
it('compacts below a provider limit lower than configured, retries, and builds later requests for it',async()=>{
 // The provider really accepts about 2 KB although 1 M is configured.
 let attempts=0,summaries=0;
 const model:any={identity:'small-provider',capabilities:{vision:false,tools:false,contextWindow:1_000_000},async *generate(request:any){
  if(request.usagePurpose==='compaction'){summaries++;yield{kind:'delta',text:'检查点'};yield{kind:'done'};return;}
  attempts++;if(Buffer.byteLength(JSON.stringify(request.messages))>2000)throw new ReaderError('CONTEXT_LIMIT','overflow');yield{kind:'delta',text:'回答'};yield{kind:'done'};}};
 const envelope:any={workspaceId:'w',sessionId:'s',mainRevision:1,messages:[{role:'system',content:'规则'},{role:'user',content:'旧问题'.repeat(2000)},{role:'assistant',content:'旧回答'.repeat(2000)},{role:'user',content:'当前问题'}],sourceRanges:[],summaryCoverage:[],budget:{limit:1_000_000,inputTokens:1,reservedOutputTokens:0}};
 const result=await toolLoop(model,envelope,[],{workspaceId:'w',sessionId:'s',runId:'r'} as any,{} as any,async()=>{},new AbortController().signal);
 expect(result.answer).toBe('回答');expect(attempts).toBe(2);expect(summaries).toBe(1);expect(effectiveContextWindow(model)).toBeLessThan(40_000);
});
