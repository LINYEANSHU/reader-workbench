import {expect,it} from 'vitest';
import {excerptAround,pageSlice,clip} from '../../packages/core/src/tools/excerpt.js';
import {HistorySearch} from '../../packages/core/src/sessions/history-search.js';
it('keeps short search hits whole and windows long ones around the matched Chinese words',()=>{
 expect(excerptAround('短段落',"短")).toEqual({text:'短段落',truncated:false});
 const text='背景'.repeat(600)+'贝叶斯公式的适用条件是事件互斥且完备'+'结论'.repeat(600),result=excerptAround(text,'贝叶斯公式适用于什么条件',300);
 expect(result.truncated).toBe(true);expect(result.text).toContain('贝叶斯公式');expect(result.text.length).toBeLessThanOrEqual(302);
 expect(excerptAround('x'.repeat(1000),'missing',100).text.startsWith('x')).toBe(true);
});
it('pages long page text with a continuation offset',()=>{
 const text='甲'.repeat(25);
 expect(pageSlice(text,0,10)).toBe('甲'.repeat(10)+'\n[本页还有 15 字未返回；需要时再次调用 read_document_page 并传 offset: 10]');
 expect(pageSlice(text,20,10)).toBe('甲'.repeat(5));expect(pageSlice(text,40,10)).toContain('超出本页长度 25');expect(pageSlice('',0,10)).toBe('');
 expect(clip('abcdef',3)).toBe('abc…[已截断，原文共 6 字]');
});
it('returns archived dialogue without raw tool messages and finds Chinese turns by shared words',async()=>{
 const turn=(id:string,revision:number,question:string,answer:string)=>({id,runId:'r'+id,revision,question,answer,messages:[{role:'tool',tool_call_id:'t',content:'RAW TOOL OUTPUT '.repeat(100)}],sourceAnchors:[],attachmentIds:[]});
 const turns=[turn('a',1,'第一章讲什么','介绍信道容量'),turn('b',2,'贝叶斯公式的适用条件','事件互斥且完备'),turn('c',3,'第三章','吞吐量')];
 const repository:any={authorizeScope:async()=>({id:'s',kind:'main'}),getCommittedTurns:async()=>turns};
 const history=new HistorySearch(repository),scope:any={workspaceId:'w',sessionId:'s'};
 const read=await history.read(scope,'s' as never);expect(read.map(item=>item.id)).toEqual(['a','b','c']);expect(JSON.stringify(read)).not.toContain('RAW TOOL OUTPUT');
 expect((await history.search(scope,'s' as never,'贝叶斯公式在什么条件下成立'))[0]?.id).toBe('b');
 // An incidental number absent from every turn must not empty the search.
 expect((await history.search(scope,'s' as never,'第2次问的贝叶斯'))[0]?.id).toBe('b');
 expect(await history.search(scope,'s' as never,'完全无关')).toEqual([]);
 await expect(history.read(scope,'other' as never)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
});
it('returns the matching middle of an archived long question',async()=>{
 const question='前'.repeat(6000)+'MIDDLE_FACT: bandwidth controls capacity.'+'后'.repeat(6000),turn={id:'t',runId:'r',revision:1,question,answer:'已回答',messages:[],sourceAnchors:[],attachmentIds:[]};
 const history=new HistorySearch({authorizeScope:async()=>({id:'s',kind:'main'}),getCommittedTurns:async()=>[turn]} as any);
 const hits=await history.search({workspaceId:'w',sessionId:'s'} as any,'s' as never,'MIDDLE_FACT');
 expect(hits).toHaveLength(1);expect(hits[0]?.question).toContain('MIDDLE_FACT: bandwidth controls capacity.');expect(hits[0]!.question.length).toBeLessThanOrEqual(4002);
});
