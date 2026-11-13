import {afterEach,expect,it,vi} from 'vitest';
import {effectiveContextWindow,learnContextLimit,isContextOverflow,resetLearnedContextLimits,attachContextLimitStore,flushContextLimits} from '../../packages/core/src/models/context-window.js';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {toolLoop} from '../../packages/core/src/runs/tool-loop.js';
import {ReaderError} from '../../packages/contracts/src/errors.js';
afterEach(()=>{resetLearnedContextLimits();vi.restoreAllMocks();});
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
it('remembers a learned limit across restarts and forgets it after thirty days',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'context-limits-'));try{
  const model={identity:'provider-a',capabilities:{vision:false,tools:false,contextWindow:1_000_000}};
  await attachContextLimitStore(directory);learnContextLimit(model,200_000);await flushContextLimits();
  const file=join(directory,'agent','context-limits.json');expect(JSON.parse(await readFile(file,'utf8'))['provider-a'].window).toBe(150_000);
  resetLearnedContextLimits();expect(effectiveContextWindow(model)).toBe(1_000_000);
  await attachContextLimitStore(directory);expect(effectiveContextWindow(model)).toBe(150_000);
  resetLearnedContextLimits();await writeFile(file,JSON.stringify({'provider-a':{window:150_000,learnedAt:new Date(Date.now()-31*24*3600*1000).toISOString()}}));
  await attachContextLimitStore(directory);expect(effectiveContextWindow(model)).toBe(1_000_000);
  resetLearnedContextLimits();await writeFile(file,'not json');await attachContextLimitStore(directory);expect(effectiveContextWindow(model)).toBe(1_000_000);
 }finally{resetLearnedContextLimits();await rm(directory,{recursive:true,force:true});}
});
it('replaces malformed learned-limit JSON when learning resumes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'context-limits-repair-'));try{
  const file=join(directory,'agent','context-limits.json');await mkdir(join(directory,'agent'));await writeFile(file,'not json');
  const model={identity:'repaired',capabilities:{vision:false,tools:false,contextWindow:1_000_000}};
  await attachContextLimitStore(directory);learnContextLimit(model,200_000);await flushContextLimits();
  resetLearnedContextLimits();await attachContextLimitStore(directory);expect(effectiveContextWindow(model)).toBe(150_000);
  expect(JSON.parse(await readFile(file,'utf8')).repaired.window).toBe(150_000);
 }finally{resetLearnedContextLimits();await rm(directory,{recursive:true,force:true});}
});
it('expires a learned limit without requiring a process restart',()=>{
 const now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now),model={identity:'expires-live',capabilities:{vision:false,tools:false,contextWindow:1_000_000}};
 learnContextLimit(model,200_000);expect(effectiveContextWindow(model)).toBe(150_000);
 clock.mockReturnValue(now+31*24*3600*1000);expect(effectiveContextWindow(model)).toBe(1_000_000);
});
