import {afterEach,describe,expect,it} from 'vitest';
import {rmSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {SessionRepository} from '../../packages/core/src/sessions/repository.js';import {SessionService} from '../../packages/core/src/sessions/service.js';import {ContextBuilder} from '../../packages/core/src/sessions/context.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';import {ToolRegistry} from '../../packages/core/src/tools/registry.js';
import {RunService} from '../../packages/core/src/runs/service.js';
import {startServer} from '../../apps/server/src/app.js';
import type {AskRequest,SessionRecord} from '../../packages/contracts/src/sessions.js';import type {RunId,RunScope} from '../../packages/contracts/src/ids.js';import type {ModelProvider} from '../../packages/sdk/src/capabilities.js';import type {RunRecord,RunEvent} from '../../packages/contracts/src/runs.js';
const actor={callerId:'local-owner',transport:'internal' as const};const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function removeRunDirectory(directory:string){
 // Services are already closed. Use Node's native removal on Windows instead
 // of the asynchronous recursive rimraf path that stalls on the hosted runner.
 // Keep failures visible, including the underlying file path and errno.
 try{if(process.platform==='win32')rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});else await rm(directory,{recursive:true,force:true});}
 catch(error){throw new Error('Temporary run workspace cleanup failed: '+directory,{cause:error});}
}
const provider=(generate:ModelProvider['generate']):ModelProvider=>({capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:512},generate});
function ask(session:SessionRecord,question='问题'):AskRequest{return{workspaceId:session.workspaceId,sessionId:session.id,question,documents:[],attachmentIds:[],providerId:'test',requestId:randomUUID(),allowArtifactWrites:session.kind==='main'};}
async function fixture(model:ModelProvider){
 const directory=await mkdtemp(join(tmpdir(),'reader runs '));cleanup.push(()=>removeRunDirectory(directory));await mkdir(join(directory,'A'));
 const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());const workspace=await workspaces.select(join(directory,'A'),actor);
 const capabilities=new CapabilityRegistry();capabilities.register(workspace.id,'model','test',model);
 const documents=new DocumentService(workspaces,capabilities);cleanup.push(()=>documents.close());const repository=new SessionRepository(workspaces),sessions=new SessionService(repository),context=new ContextBuilder(repository,documents,capabilities),tools=new ToolRegistry(capabilities,scope=>repository.authorizeScope(scope));
 const runs=new RunService({workspaces,repository,context,tools,documents,capabilities});cleanup.push(()=>runs.close());const main=await sessions.createMain(workspace.id,'main'),temporary=await sessions.createTemporary(workspace.id,main.id);
 return{directory,workspaces,workspace,capabilities,documents,repository,sessions,context,tools,runs,main,temporary};
}
async function finish(runs:RunService,request:AskRequest){const {runId}=await runs.submit(request,actor);const events:RunEvent[]=[];for await(const event of runs.events(request.workspaceId,runId,0,new AbortController().signal))events.push(event);return{runId,events,record:await runs.get(request.workspaceId,runId)};}
describe('scoped agent runs',()=>{
 it.each(['citation','commit'] as const)('does not commit a cancelled temporary turn at the %s boundary',async boundary=>{
  let modelSignal!:AbortSignal;const f=await fixture(provider(async function*(_request,signal){modelSignal=signal;yield{kind:'delta',text:'last answer'};yield{kind:'done'};}));
  await writeFile(join(f.directory,'A','late.md'),'# Source\n\nA cited passage.');const doc=await f.documents.open(f.workspace.id,'late.md',new AbortController().signal);await f.documents.waitReady(doc,new AbortController().signal);
  const parent=await f.repository.snapshot(f.workspace.id,f.main.id),own=await f.repository.snapshot(f.workspace.id,f.temporary.id);let release!:()=>void,reached!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{reached=resolve;});
  if(boundary==='citation'){const emit=f.runs.records.emit.bind(f.runs.records);f.runs.records.emit=async(...args)=>{if(args[1]==='citation'){reached();await gate;}return emit(...args);};}
  else{const commit=f.repository.completeOwnTurn.bind(f.repository);f.repository.completeOwnTurn=async(...args)=>{reached();await gate;return commit(...args);};}
  const {runId}=await f.runs.submit({...ask(f.temporary),documents:[doc]},actor);
  try{await entered;const cancellation=f.runs.cancel(f.workspace.id,runId,actor);await expect.poll(()=>modelSignal.aborted).toBe(true);release();await cancellation;
   expect((await f.runs.get(f.workspace.id,runId)).status).toBe('cancelled');expect(await f.repository.snapshot(f.workspace.id,f.temporary.id)).toEqual(own);expect(await f.repository.snapshot(f.workspace.id,f.main.id)).toEqual(parent);
  }finally{release();}
 });
 it('keeps repeated source citations unique across completed main and temporary turns',async()=>{const f=await fixture(provider(async function*(){yield{kind:'delta',text:'RI explanation'};yield{kind:'done'};}));await writeFile(join(f.directory,'A','reading.md'),'# RI\n\nRI is rank indicator.\n');const document=await f.documents.open(f.workspace.id,'reading.md',new AbortController().signal);for(const session of [f.main,f.main,f.temporary,f.temporary]){const result=await finish(f.runs,{...ask(session,'RI'),documents:[document]}),record=result.record as RunRecord;expect(record.status).toBe('completed');const anchors=record.context!.sourceRanges;expect(new Set(anchors.map(anchor=>JSON.stringify(anchor))).size).toBe(anchors.length);const turn=(await f.sessions.getHistory(f.workspace.id,session.id)).turns.at(-1)!;expect(new Set(turn.sourceAnchors.map(anchor=>JSON.stringify(anchor))).size).toBe(turn.sourceAnchors.length);}});
 it('deduplicates requests and persists monotonic resumable events with one side effect',async()=>{
  let generations=0,effects=0;const f=await fixture(provider(async function*(){if(generations++===0){yield{kind:'tool-call',id:'call1',name:'write_once',input:{value:'hello'}};}else yield{kind:'delta',text:'已生成'};yield{kind:'done'};}));
  f.capabilities.register(f.workspace.id,'tool','write',{tools:[{name:'write_once',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},effect:'write_artifact',execute:async()=>{effects++;return{content:'saved'};}}]});
  const request=ask(f.main);const [first,repeated]=await Promise.all([f.runs.submit(request,actor),f.runs.submit(request,actor)]);expect(repeated.runId).toBe(first.runId);
  const events:RunEvent[]=[];for await(const event of f.runs.events(f.workspace.id,first.runId,0,new AbortController().signal))events.push(event);
  expect(effects).toBe(1);expect(events.map(event=>event.seq)).toEqual(events.map((_,index)=>index+1));expect(events.filter(e=>e.kind==='state').map(e=>(e.data as {status:string}).status)).toEqual(['queued','running','completed']);
  const resumed:RunEvent[]=[];for await(const event of f.runs.events(f.workspace.id,first.runId,3,new AbortController().signal))resumed.push(event);expect(resumed).toEqual(events.filter(event=>event.seq>3));
  expect((await f.sessions.getHistory(f.workspace.id,f.main.id)).turns).toHaveLength(1);
  expect((await f.runs.submit(request,actor)).runId).toBe(first.runId);
  await f.capabilities.retireOwner(f.workspace.id,'core');expect((await f.runs.submit(request,actor)).runId).toBe(first.runId);
 });
 it('serializes one session while independent temporary branches execute in parallel',async()=>{
  const active=new Set<string>();let simultaneousSame=false,maxActive=0;
  const f=await fixture(provider(async function*(request,signal){const marker=String(request.messages.at(-1)?.content);if(active.has(marker))simultaneousSame=true;active.add(marker);maxActive=Math.max(maxActive,active.size);await delay(50,undefined,{signal});yield{kind:'delta',text:'完成 '+marker};active.delete(marker);yield{kind:'done'};}));
  const other=await f.sessions.createTemporary(f.workspace.id,f.main.id);
  await Promise.all([finish(f.runs,ask(f.temporary,'same')),finish(f.runs,ask(f.temporary,'same')),finish(f.runs,ask(other,'other'))]);
  expect(simultaneousSame).toBe(false);expect(maxActive).toBe(2);expect((await f.sessions.getHistory(f.workspace.id,f.temporary.id)).turns).toHaveLength(2);expect((await f.sessions.getHistory(f.workspace.id,f.main.id)).turns).toHaveLength(0);
 });
 it('cancels a model stream and keeps partial output bound to A after switching to B',async()=>{
  let aborted=false;const f=await fixture(provider(async function*(_request,signal){yield{kind:'delta',text:'部分文字'};try{await delay(10000,undefined,{signal});}finally{aborted=signal.aborted;}yield{kind:'done'};}));
  const request=ask(f.temporary);const {runId}=await f.runs.submit(request,actor);const events=f.runs.events(f.workspace.id,runId,0,new AbortController().signal);
  for await(const event of events){if(event.kind==='delta')break;}
  await mkdir(join(f.directory,'B'));const workspaceB=await f.workspaces.select(join(f.directory,'B'),actor);expect(workspaceB.id).not.toBe(f.workspace.id);
  await f.runs.cancel(f.workspace.id,runId,actor);const all:RunEvent[]=[];for await(const event of f.runs.events(f.workspace.id,runId,0,new AbortController().signal))all.push(event);
  expect(aborted).toBe(true);const record=await f.runs.get(f.workspace.id,runId);expect(record.status).toBe('cancelled');expect(record.workspaceId).toBe(f.workspace.id);expect(all.every(e=>e.workspaceId===f.workspace.id)).toBe(true);
  expect((await f.sessions.getHistory(f.workspace.id,f.temporary.id)).turns).toHaveLength(0);expect((await f.sessions.getHistory(f.workspace.id,f.main.id)).turns).toHaveLength(0);
 });
 it('cancels a running tool, rejects invalid schema and denies temporary external writes',async()=>{
  let mode='long',aborted=false,effects=0;const f=await fixture(provider(async function*(){yield{kind:'tool-call',id:'c',name:mode==='external'?'external':'long',input:mode==='invalid'?{unexpected:true}:{value:'x'}};yield{kind:'done'};}));
  f.capabilities.register(f.workspace.id,'tool','tools',{tools:[{name:'long',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},effect:'read',execute:async(_i,_s,signal)=>{try{await delay(10000,undefined,{signal});}finally{aborted=signal.aborted;}return{content:'done'};}},{name:'external',inputSchema:{type:'object'},effect:'external_write',execute:async()=>{effects++;return{content:'written'};}}]});
  const request=ask(f.temporary),submission=await f.runs.submit(request,actor);for await(const event of f.runs.events(f.workspace.id,submission.runId,0,new AbortController().signal)){if(event.kind==='tool-start')break;}
  await f.runs.cancel(f.workspace.id,submission.runId,actor);for await(const _event of f.runs.events(f.workspace.id,submission.runId,0,new AbortController().signal)){}expect(aborted).toBe(true);
  mode='invalid';expect((await finish(f.runs,ask(f.temporary))).record.error?.code).toBe('TOOL_INPUT_INVALID');mode='external';expect((await finish(f.runs,ask(f.temporary))).record.error?.code).toBe('TOOL_SCOPE_DENIED');expect(effects).toBe(0);
 });
 it('interrupts orphan runs after restart and never replays uncertain effects',async()=>{
  const f=await fixture(provider(async function*(){yield{kind:'delta',text:'ok'};yield{kind:'done'};}));const request=ask(f.main),id=randomUUID() as RunId;
  const store=await f.workspaces.storeFor(f.workspace.id);await store.runs.create({id,kind:'agent',workspaceId:f.workspace.id,sessionId:f.main.id,status:'running',requestId:request.requestId,request,callerId:actor.callerId});
  const [result,again]=await Promise.all([f.runs.get(f.workspace.id,id),f.runs.get(f.workspace.id,id)]);expect(result.status).toBe('failed');expect(again.status).toBe('failed');expect(result.error?.code).toBe('RUN_INTERRUPTED');expect((await f.sessions.getHistory(f.workspace.id,f.main.id)).turns).toHaveLength(0);
  expect((await store.runs.readEvents(id,0)).filter(event=>event.kind==='state')).toHaveLength(1);
  const scope:RunScope={actor,workspaceId:f.workspace.id,sessionId:f.main.id,runId:id,allowArtifactWrites:true},release=await f.repository.registerScope(scope);let effects=0;
  f.capabilities.register(f.workspace.id,'tool','uncertain',{tools:[{name:'side',inputSchema:{type:'object'},effect:'write_artifact',execute:async()=>{effects++;return{content:'saved'};}}]});
  store.putRecord('tool-executions',id+':call',{status:'started',name:'side',inputHash:'unknown'});
  await expect(f.runs.executor.execute('side',{},scope,id+':call',new AbortController().signal)).rejects.toMatchObject({code:'TOOL_EXECUTION_UNCERTAIN'});release();expect(effects).toBe(0);
 });
 it('fails a tool loop after eight rounds and keeps failed temporary output out of parent memory',async()=>{
  let rounds=0;const f=await fixture(provider(async function*(){yield{kind:'tool-call',id:String(++rounds),name:'read',input:{}};yield{kind:'done'};}));f.capabilities.register(f.workspace.id,'tool','read',{tools:[{name:'read',inputSchema:{type:'object'},effect:'read',execute:async()=>({content:'data'})}]});
  const parent=await f.repository.snapshot(f.workspace.id,f.main.id);const result=await finish(f.runs,ask(f.temporary));expect(result.record.error?.code).toBe('TOOL_ROUND_LIMIT');expect(rounds).toBe(8);expect(await f.repository.snapshot(f.workspace.id,f.main.id)).toEqual(parent);
 });
 it('cancels a queued request immediately while the earlier request remains running',async()=>{
  const f=await fixture(provider(async function*(_r,signal){yield{kind:'delta',text:'等待'};await delay(10000,undefined,{signal});yield{kind:'done'};}));
  const first=await f.runs.submit(ask(f.main,'first'),actor);for await(const event of f.runs.events(f.workspace.id,first.runId,0,new AbortController().signal)){if(event.kind==='delta')break;}
  const queued=await f.runs.submit(ask(f.main,'queued'),actor);
  const result=await Promise.race([f.runs.cancel(f.workspace.id,queued.runId,actor).then(()=>true),delay(300).then(()=>false)]);expect(result).toBe(true);
  expect((await f.runs.get(f.workspace.id,queued.runId)).status).toBe('cancelled');expect((await f.runs.get(f.workspace.id,first.runId)).status).toBe('running');await f.runs.cancel(f.workspace.id,first.runId,actor);
 });
 it('protects a temporary branch while its context waits for a document',async()=>{
  const f=await fixture(provider(async function*(){yield{kind:'delta',text:'回答'};yield{kind:'done'};}));
  f.capabilities.register(f.workspace.id,'document','slow',{supports:(_mime,extension)=>extension==='.wait',parse:async(_input,signal)=>{await delay(10000,undefined,{signal});return{pages:[],blocks:[],warnings:[]};}});
  await writeFile(join(f.directory,'A','slow.wait'),'content');const document=await f.documents.open(f.workspace.id,'slow.wait',new AbortController().signal);
  const submission=await f.runs.submit({...ask(f.temporary),documents:[document]},actor);for await(const event of f.runs.events(f.workspace.id,submission.runId,0,new AbortController().signal)){if(event.kind==='state'&&(event.data as {status:string}).status==='running')break;}
  await expect(f.sessions.clearTemporary(f.workspace.id,f.temporary.id,actor)).rejects.toMatchObject({code:'SESSION_BUSY'});
  await f.runs.cancel(f.workspace.id,submission.runId,actor);await f.documents.jobs.cancel(f.workspace.id,document.processingRunId);
 });
 it('inherits completed main turns during a real concurrent stream and freezes archive tool reads',async()=>{
  let releaseMain!:()=>void,releaseTemporary!:()=>void,mainId='';const mainGate=new Promise<void>(resolve=>{releaseMain=resolve;}),temporaryGate=new Promise<void>(resolve=>{releaseTemporary=resolve;});
  const f=await fixture(provider(async function*(request){
   if(request.messages.at(-1)?.role==='tool'){expect(String(request.messages.at(-1)?.content)).not.toContain('B-answer');yield{kind:'delta',text:'T1-answer'};yield{kind:'done'};return;}
   const question=String(request.messages.at(-1)?.content);
   if(question==='A'){yield{kind:'delta',text:'A-answer'};}
   else if(question==='B'){yield{kind:'delta',text:'B-answer'};await mainGate;}
   else if(question==='T1'){await temporaryGate;yield{kind:'tool-call',id:'history',name:'read_history',input:{sessionId:mainId}};}
   else yield{kind:'delta',text:'T2-answer'};yield{kind:'done'};
  }));mainId=f.main.id;
  try{
   await finish(f.runs,ask(f.main,'A'));const second=await f.runs.submit(ask(f.main,'B'),actor);for await(const event of f.runs.events(f.workspace.id,second.runId,0,new AbortController().signal)){if(event.kind==='delta')break;}
   const firstTemporary=await f.runs.submit(ask(f.temporary,'T1'),actor);for await(const event of f.runs.events(f.workspace.id,firstTemporary.runId,0,new AbortController().signal)){if(event.kind==='context')break;}
   const frozen=await f.runs.get(f.workspace.id,firstTemporary.runId) as RunRecord;expect(frozen.contextRevision).toBe(1);expect(JSON.stringify(frozen.context?.messages)).not.toContain('B-answer');
   releaseMain();for await(const _event of f.runs.events(f.workspace.id,second.runId,0,new AbortController().signal)){}const parent=await f.repository.snapshot(f.workspace.id,f.main.id);
   releaseTemporary();for await(const _event of f.runs.events(f.workspace.id,firstTemporary.runId,0,new AbortController().signal)){}expect(await f.repository.snapshot(f.workspace.id,f.main.id)).toEqual(parent);
   const next=await finish(f.runs,ask(f.temporary,'T2'));const record=next.record as RunRecord;expect(record.contextRevision).toBe(2);expect(JSON.stringify(record.context?.messages)).toContain('B-answer');expect(JSON.stringify(record.context?.messages)).toContain('T1-answer');expect(await f.repository.snapshot(f.workspace.id,f.main.id)).toEqual(parent);
  }finally{releaseMain();releaseTemporary();}
 });
 it('streams authenticated HTTP events and resumes terminal output using Last-Event-ID',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reader run http '));cleanup.push(()=>removeRunDirectory(directory));const root=join(directory,'work');await mkdir(root);
  const server=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),noOpen:true,demo:false});let closing:Promise<void>|undefined;cleanup.push(()=>closing??=server.close());const workspace=await server.workspaces.select(root,actor);
  server.capabilities.register(workspace.id,'model','test',provider(async function*(){yield{kind:'delta',text:'中文流式回答'};yield{kind:'done'};}));const main=await server.sessions.createMain(workspace.id,'HTTP');
  const headers={authorization:'Bearer '+server.auth.token,'content-type':'application/json'},response=await fetch(server.url+'/api/v1/runs',{method:'POST',headers,body:JSON.stringify(ask(main))});expect(response.status).toBe(202);const {runId}=await response.json() as {runId:RunId};
  const stream=await fetch(server.url+'/api/v1/runs/'+runId+'/events?workspaceId='+workspace.id,{headers});expect(stream.headers.get('content-type')).toContain('text/event-stream');const text=await stream.text();expect(text).toContain('中文流式回答');expect(text).toContain('"status":"completed"');
  const resumed=await fetch(server.url+'/api/v1/runs/'+runId+'/events?workspaceId='+workspace.id,{headers:{...headers,'last-event-id':'2'}});expect(await resumed.text()).not.toContain('id: 1\n');expect((await fetch(server.url+'/api/v1/runs/'+runId,{headers})).status).toBe(400);
  let entered!:()=>void,aborted=false,completed=false;const started=new Promise<void>(resolve=>entered=resolve);
  server.capabilities.register(workspace.id,'model','long',provider(async function*(_r,signal){signal.addEventListener('abort',()=>aborted=true,{once:true});entered();yield{kind:'delta',text:'部分'};await delay(10000,undefined,{signal});completed=true;yield{kind:'done'};}));
  const next=await fetch(server.url+'/api/v1/runs',{method:'POST',headers,body:JSON.stringify({...ask(main),providerId:'long'})});const nextId=(await next.json() as {runId:string}).runId;
  const connection=new AbortController();const pending=await fetch(server.url+'/api/v1/runs/'+nextId+'/events?workspaceId='+workspace.id,{headers,signal:connection.signal});const drained=pending.text().catch(()=>{});
  try{await started;closing=server.close();await closing;expect(aborted).toBe(true);expect(completed).toBe(false);await expect(fetch(server.url+'/health')).rejects.toThrow();}finally{connection.abort();await drained;}
 });
});
