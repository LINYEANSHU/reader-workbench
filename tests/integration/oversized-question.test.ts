import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {startServer} from '../../apps/server/src/app.js';
const actor={callerId:'local-owner',transport:'internal' as const},cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
it('sends the beginning and end of an oversized question and lets the model read the rest',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'oversized-question-')),root=join(directory,'workspace');await mkdir(root);
 const host=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:true,noOpen:true});cleanup.push(()=>rm(directory,{recursive:true,force:true}),()=>host.close());
 const workspace=await host.workspaces.select(root,actor),requests:any[]=[];let round=0;
 host.capabilities.register(workspace.id,'model','small',{identity:'small',capabilities:{vision:false,tools:true,contextWindow:120_000},async *generate(input:any){requests.push(structuredClone(input));
  if(round++===0){yield{kind:'tool-call',id:'find',name:'read_question_text',input:{query:'关键结论'}};yield{kind:'done'};return;}
  yield{kind:'delta',text:'已读到中间部分'};yield{kind:'done'};}});
 const question='开头说明。'+'甲'.repeat(15_000)+'关键结论：容量取决于带宽。'+'乙'.repeat(15_000)+'结尾的问题是什么？',main=await host.sessions.createMain(workspace.id,'长问题');
 const run=await host.runs.submit({workspaceId:workspace.id,sessionId:main.id,documents:[],question,providerId:'small',requestId:randomUUID(),attachmentIds:[],allowArtifactWrites:false},actor);
 for await(const _event of host.runs.events(workspace.id,run.runId,0,new AbortController().signal)){}
 expect((await host.runs.get(workspace.id,run.runId)).status).toBe('completed');
 const sent=String(requests[0].messages.at(-1).content);
 expect(sent.startsWith('开头说明。')).toBe(true);expect(sent.endsWith('结尾的问题是什么？')).toBe(true);expect(sent).toContain('read_question_text');expect(sent).not.toContain('关键结论');
 expect(Buffer.byteLength(sent)).toBeLessThanOrEqual(30_000);
 const tool=requests[1].messages.find((message:any)=>message.role==='tool'),found=JSON.parse(tool.content);
 expect(found.length).toBe(question.length);expect(found.matches[0].text).toContain('关键结论：容量取决于带宽。');expect(found.matches[0].offset).toBe(question.indexOf('关键结论'));
 const [turn]=await host.sessionRepository.getCommittedTurns(workspace.id,main.id);expect(turn?.question).toBe(question);expect(Buffer.byteLength(String(turn?.messages[0]?.content))).toBeLessThanOrEqual(25*1024);
},60_000);
it('reads the full question in slices and refuses another run',async()=>{
 const {builtinTools}=await import('../../packages/core/src/tools/builtins.js');
 const record={sessionId:'s',callerId:'c',request:{question:'问'.repeat(30_000)}},runs={get:async()=>record} as any,scope:any={workspaceId:'w',sessionId:'s',runId:'r',actor:{callerId:'c'}};
 const tool=builtinTools({} as any,{} as any,runs).tools.find(item=>item.name==='read_question_text')!;
 const first=(await tool.execute({},scope,new AbortController().signal)).content;expect(first).toContain('read_question_text 并传 offset: 12000');
 expect((await tool.execute({offset:24000},scope,new AbortController().signal)).content).toBe('问'.repeat(6000));
 await expect(tool.execute({},{...scope,sessionId:'other'},new AbortController().signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
});
it('preserves a question that fits when the model cannot retrieve omitted text',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'question-no-tools-')),root=join(directory,'workspace');await mkdir(root);
 const host=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:true,noOpen:true});cleanup.push(()=>rm(directory,{recursive:true,force:true}),()=>host.close());
 const workspace=await host.workspaces.select(root,actor),requests:any[]=[];
 host.capabilities.register(workspace.id,'model','no-tools',{capabilities:{vision:false,tools:false,contextWindow:120_000},async *generate(input:any){requests.push(structuredClone(input));yield{kind:'delta',text:'完整回答'};yield{kind:'done'};}});
 const question='A'.repeat(20_000)+'MIDDLE_FACT'+'B'.repeat(20_000),main=await host.sessions.createMain(workspace.id,'完整问题');
 const ask=async(text:string)=>{const run=await host.runs.submit({workspaceId:workspace.id,sessionId:main.id,documents:[],question:text,providerId:'no-tools',requestId:randomUUID(),attachmentIds:[],allowArtifactWrites:false},actor);for await(const _event of host.runs.events(workspace.id,run.runId,0,new AbortController().signal)){}return host.runs.get(workspace.id,run.runId);};
 expect((await ask(question)).status).toBe('completed');expect(requests[0].messages.at(-1).content.includes('MIDDLE_FACT')).toBe(true);expect(requests[0].messages.at(-1).content).toHaveLength(question.length);
 expect((await ask('Recall the middle fact.')).status).toBe('completed');expect(requests[1].messages.some((message:any)=>message.role==='user'&&message.content===question)).toBe(true);
 const rejected=await ask('X'.repeat(130_000));expect(rejected.status).toBe('failed');expect(rejected.error?.code).toBe('CONTEXT_LIMIT');expect(requests).toHaveLength(2);
},60_000);
it('retrieves archived question slices within the pinned session history',async()=>{
 const {builtinTools}=await import('../../packages/core/src/tools/builtins.js');
 const question='旧'.repeat(15_000)+'ARCHIVED_FACT'+'尾'.repeat(15_000),turn={id:'old-turn',runId:'old-run',revision:2,question,answer:'done',messages:[],sourceAnchors:[],attachmentIds:[]};
 const repository:any={authorizeScope:async()=>({id:'child',kind:'temporary',parentMainSessionId:'parent'}),getCommittedTurns:async(_workspace:string,_session:string,revision:number)=>revision>=2?[turn]:[]};
 const runs:any={get:async()=>({sessionId:'child',callerId:'c',request:{question:'current'}})},scope:any={workspaceId:'w',sessionId:'child',runId:'r',actor:{callerId:'c'},readRevisions:{parent:2}};
 const tool=builtinTools({} as any,repository,runs).tools.find(item=>item.name==='read_question_text')!;
 const result=await tool.execute({sessionId:'parent',turnId:'old-turn',offset:15000},scope,new AbortController().signal);expect(result.content).toContain('ARCHIVED_FACT');
 const found=JSON.parse((await tool.execute({sessionId:'parent',turnId:'old-turn',query:'ARCHIVED_FACT'},scope,new AbortController().signal)).content);expect(found.matches[0].offset).toBe(15000);
 await expect(tool.execute({sessionId:'other',turnId:'old-turn'},scope,new AbortController().signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
 await expect(tool.execute({sessionId:'parent',turnId:'old-turn'},{...scope,readRevisions:{parent:1}},new AbortController().signal)).rejects.toMatchObject({code:'HISTORY_NOT_FOUND'});
});
it('uses the request language for question context and continuation instructions',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'question-english-')),root=join(directory,'workspace');await mkdir(root);
 const host=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:true,noOpen:true});cleanup.push(()=>rm(directory,{recursive:true,force:true}),()=>host.close());
 const workspace=await host.workspaces.select(root,actor),requests:any[]=[];let round=0;
 host.capabilities.register(workspace.id,'model','english',{capabilities:{vision:false,tools:true,contextWindow:120_000},async *generate(input:any){requests.push(structuredClone(input));if(round++===0)yield{kind:'tool-call',id:'read',name:'read_question_text',input:{offset:0}};else yield{kind:'delta',text:'Done.'};yield{kind:'done'};}});
 const main=await host.sessions.createMain(workspace.id,'English'),run=await host.runs.submit({workspaceId:workspace.id,sessionId:main.id,documents:[],question:'A'.repeat(40_000),providerId:'english',requestId:randomUUID(),attachmentIds:[],allowArtifactWrites:false,locale:'en'},actor);
 for await(const _event of host.runs.events(workspace.id,run.runId,0,new AbortController().signal)){}
 expect((await host.runs.get(workspace.id,run.runId)).status).toBe('completed');
 expect(requests[0].messages[0].content).toContain('Reading and permission rules:');expect(requests[0].messages.at(-1).content).toContain('middle was omitted');
 const result=requests[1].messages.find((message:any)=>message.role==='tool').content;expect(result).toContain('offset: 12000');expect(result).toContain('characters remain');expect(result).not.toContain('未返回');
},60_000);
