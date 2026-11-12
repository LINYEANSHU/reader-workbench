import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {startServer} from '../../apps/server/src/app.js';
import type {RunRecord} from '../../packages/contracts/src/runs.js';
const actor={callerId:'local-owner',transport:'internal' as const},cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function setup(compaction:(signal:AbortSignal)=>Promise<string>){
 const directory=await mkdtemp(join(tmpdir(),'background-compaction-')),root=join(directory,'workspace');await mkdir(root);
 const host=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:true,noOpen:true});cleanup.push(()=>rm(directory,{recursive:true,force:true}),()=>host.close());
 const workspace=await host.workspaces.select(root,actor),answers:string[][]=[],compactions:number[]=[];
 host.capabilities.register(workspace.id,'model','long',{identity:'long',capabilities:{vision:false,tools:false,contextWindow:1_000_000},async *generate(input:any,signal:AbortSignal){
  if(input.usagePurpose==='compaction'){compactions.push(Date.now());const text=await compaction(signal);yield{kind:'delta',text};yield{kind:'done'};return;}
  const question=String(input.messages.at(-1).content);answers.push(input.messages.map((message:any)=>String(message.content)));yield{kind:'delta',text:'回答'+question+'：'+'长'.repeat(10000)};yield{kind:'done'};}});
 const main=await host.sessions.createMain(workspace.id,'长对话');
 const ask=async(question:string)=>{const run=await host.runs.submit({workspaceId:workspace.id,sessionId:main.id,documents:[],question,providerId:'long',requestId:randomUUID(),attachmentIds:[],allowArtifactWrites:false},actor);const events=[];for await(const event of host.runs.events(workspace.id,run.runId,0,new AbortController().signal))events.push(event);return{record:await host.runs.get(workspace.id,run.runId) as RunRecord,events};};
 return{host,workspace,main,ask,answers,compactions};
}
it('summarizes older turns after an answer so the next question reuses the summary without waiting',async()=>{
 const s=await setup(async()=>'检查点：问题1到3讨论了信道容量。');
 for(const question of ['问题1','问题2','问题3'])await s.ask(question);
 expect(s.compactions).toHaveLength(0);
 await s.ask('问题4');
 await expect.poll(async()=>(await s.host.sessionRepository.snapshot(s.workspace.id,s.main.id)).summary?.turnIds.length,{timeout:10_000}).toBe(3);
 const next=await s.ask('问题5'),sent=s.answers.at(-1)!.join('\n');
 expect(next.record.status).toBe('completed');expect(next.record.context?.summaryCoverage).toHaveLength(3);
 expect(sent).toContain('检查点：问题1到3讨论了信道容量。');expect(sent).not.toContain('回答问题1');expect(sent).toContain('回答问题4');
 expect(next.events.some(event=>event.kind==='progress'&&JSON.stringify(event.data).includes('正在压缩上下文'))).toBe(false);
 expect(s.compactions).toHaveLength(1);
},60_000);
it('cancels background compaction when a new question arrives and saves no partial summary',async()=>{
 let entered!:()=>void,aborted=false;const started=new Promise<void>(resolve=>entered=resolve);
 const s=await setup(signal=>new Promise((_,reject)=>{entered();signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true});}));
 for(const question of ['问题1','问题2','问题3','问题4'])await s.ask(question);
 await started;const next=await s.ask('问题5');
 expect(aborted).toBe(true);expect(next.record.status).toBe('completed');
 expect((await s.host.sessionRepository.snapshot(s.workspace.id,s.main.id)).summary).toBeNull();
},60_000);
