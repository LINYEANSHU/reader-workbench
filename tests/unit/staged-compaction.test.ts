import {afterEach,expect,it} from 'vitest';
import {toolLoop,clipTokens} from '../../packages/core/src/runs/tool-loop.js';
import {resetLearnedContextLimits} from '../../packages/core/src/models/context-window.js';
import {ReaderError} from '../../packages/contracts/src/errors.js';
afterEach(()=>resetLearnedContextLimits());
const scope:any={workspaceId:'w',sessionId:'s',runId:'r'};
// [system, full document memory, history question, history answer, retrieved excerpt, question]
const envelope=(memory:string,history:string,question='当前问题'):any=>({workspaceId:'w',sessionId:'s',mainRevision:1,layout:{stable:1,history:2},summaryCoverage:[],sourceRanges:[],budget:{limit:1,inputTokens:1,reservedOutputTokens:0},
 messages:[{role:'system',content:'规则'},{role:'user',content:memory},{role:'user',content:'旧问题 '+history},{role:'assistant',content:'旧回答 '+history},{role:'user',content:'文档摘录 EXCERPT'},{role:'user',content:question}]});
const text=(request:any)=>request.messages.map((message:any)=>typeof message.content==='string'?message.content:JSON.stringify(message.content)).join('\n');
it('summarizes history and old tool exchanges but sends document memory verbatim when tool output fills the window',async()=>{
 const memory='本地文档阅读记忆 '+'记'.repeat(1000),conversation:string[]=[];let summaries=0,round=0;
 const model:any={capabilities:{vision:false,tools:true,contextWindow:20_000},async *generate(request:any){
  if(request.usagePurpose==='compaction'){summaries++;expect(text(request)).not.toContain('本地文档阅读记忆');yield{kind:'delta',text:'检查点：旧问答要点'};yield{kind:'done'};return;}
  conversation.push(text(request));if(round++===0)yield{kind:'tool-call',id:'read',name:'read_document_page',input:{page:1}};else yield{kind:'delta',text:'回答'};yield{kind:'done'};}};
 const executor:any={execute:async()=>({content:'页面原文 '+'页'.repeat(2500)})};
 const result=await toolLoop(model,envelope(memory,'史'.repeat(2500)),[],scope,executor,async()=>{},new AbortController().signal);
 expect(result.answer).toBe('回答');expect(summaries).toBe(1);
 const last=conversation.at(-1)!;expect(last).toContain(memory);expect(last).toContain('EXCERPT');expect(last).toContain('<compacted-summary>');expect(last).not.toContain('旧回答');expect(last).toContain('页面原文');
});
it('shortens document context, pointing to the reading tools, when the provider accepts even less',async()=>{
 const memory='本地文档阅读记忆 '+'记'.repeat(3000);let attempts=0;const sizes:number[]=[];
 const model:any={identity:'tiny',capabilities:{vision:false,tools:false,contextWindow:1_000_000},async *generate(request:any){
  if(request.usagePurpose==='compaction'){yield{kind:'delta',text:'检查点'};yield{kind:'done'};return;}
  attempts++;const size=Buffer.byteLength(JSON.stringify(request.messages));sizes.push(size);if(size>6000)throw new ReaderError('CONTEXT_LIMIT','overflow');yield{kind:'delta',text:'回答'};yield{kind:'done'};}};
 const result=await toolLoop(model,envelope(memory,'史'.repeat(3000)),[],scope,{} as any,async()=>{},new AbortController().signal);
 expect(result.answer).toBe('回答');expect(attempts).toBeGreaterThan(1);expect(sizes.at(-1)).toBeLessThanOrEqual(6000);
});
it('cuts an oversized tool result to a quarter of the window with a note',async()=>{
 let round=0,seen='';
 const model:any={capabilities:{vision:false,tools:true,contextWindow:40_000},async *generate(request:any){if(round++===0){yield{kind:'tool-call',id:'big',name:'plugin_tool',input:{}};yield{kind:'done'};return;}seen=text(request);yield{kind:'delta',text:'回答'};yield{kind:'done'};}};
 const result=await toolLoop(model,envelope('记忆','史'),[],scope,{execute:async()=>({content:'大'.repeat(20_000)})} as any,async()=>{},new AbortController().signal);
 const tool=result.ownMessages.find(message=>message.role==='tool')!;expect(Buffer.byteLength(tool.content as string)).toBeLessThanOrEqual(10_000);expect(tool.content).toContain('[工具结果过长已截断');expect(seen).toContain('[工具结果过长已截断');
});
it('fails clearly only when the question itself exceeds the window',async()=>{
 const model:any={identity:'q',capabilities:{vision:false,tools:false,contextWindow:1_000_000},async *generate(request:any){if(request.usagePurpose==='compaction'){yield{kind:'delta',text:'检查点'};yield{kind:'done'};return;}throw new ReaderError('CONTEXT_LIMIT','overflow');}};
 await expect(toolLoop(model,envelope('记忆','史','问'.repeat(5000)),[],scope,{} as any,async()=>{},new AbortController().signal)).rejects.toMatchObject({code:'CONTEXT_LIMIT'});
 expect(clipTokens('一二三四五',9,'…')).toBe('一二…');expect(clipTokens('短',100,'…')).toBe('短');
});
it('recovers when the provider rejects both the initial context and its history compaction request',async()=>{
 let conversations=0,rejectedSummaries=0;const sizes:number[]=[];
 const model:any={identity:'summary-overflow',capabilities:{vision:false,tools:true,contextWindow:1_000_000},async *generate(request:any){
  const size=Buffer.byteLength(JSON.stringify(request.messages));
  if(request.usagePurpose==='compaction'){if(size>15_000){rejectedSummaries++;throw new ReaderError('CONTEXT_LIMIT','summary overflow');}yield{kind:'delta',text:'历史检查点'};yield{kind:'done'};return;}
  conversations++;sizes.push(size);if(size>15_000)throw new ReaderError('CONTEXT_LIMIT','conversation overflow');yield{kind:'delta',text:'回答'};yield{kind:'done'};
 }};
 const result=await toolLoop(model,envelope('d'.repeat(20_000),'h'.repeat(12_000)),[],scope,{} as any,async()=>{},new AbortController().signal);
 expect(result.answer).toBe('回答');expect(rejectedSummaries).toBe(1);expect(conversations).toBeGreaterThan(1);expect(sizes.at(-1)).toBeLessThanOrEqual(15_000);
});
