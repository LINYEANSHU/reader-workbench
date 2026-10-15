import {afterEach,describe,expect,it} from 'vitest';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {startServer} from '../../apps/server/src/app.js';
import {serverIntegrationTimeout} from '../helpers/server-integration.js';
import type {ModelRequest,ModelSettings} from '../../packages/contracts/src/models.js';

const actor={callerId:'local-owner',transport:'internal' as const};
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});

async function setup(){
 const directory=await mkdtemp(join(tmpdir(),'reader usage '));
 cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const root=join(directory,'workspace');await mkdir(root);
 const calls:Record<string,unknown>[]=[];
 const remote=createServer(async(req,res)=>{
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');return;}
  let body='';for await(const part of req)body+=part;
  const request=JSON.parse(body);calls.push(request);
  const question=String(request.messages.at(-1)?.content);
  const instruction=String(request.messages[0]?.content);
  res.writeHead(200,{'content-type':'text/event-stream'});
  const frame=(value:unknown)=>res.write('data: '+JSON.stringify(value)+'\n\n');
  let content='answer';
  if(instruction.includes('VISUAL_DOCUMENT_MEMORY_PAGES')){
   const pages=request.messages.flatMap((message:{content:unknown})=>Array.isArray(message.content)?message.content.filter((item:{type:string})=>item.type==='text').map((item:{text:string})=>Number(/文档页 (\d+)/.exec(item.text)?.[1])).filter(Boolean):[]);
   content=JSON.stringify({pages:pages.map((page:number)=>({page,summary:'Page '+page,transcription:'',figures:[],formulas:[],terms:[],uncertainties:[],crossPageRelations:[]}))});
  }else if(instruction.includes('VISUAL_DOCUMENT_MEMORY_OVERVIEW'))content='One page overview.';
  const toolCall=question==='tools'&&!request.messages.some((message:{role:string})=>message.role==='tool');
  frame({choices:[{delta:toolCall?{tool_calls:[{index:0,id:'read-usage',function:{name:'read_usage',arguments:'{}'}}]}:{content},finish_reason:null}],usage:null});
  if(question==='cancel')return;
  if(question==='partial')frame({usage:{prompt_tokens:99},choices:[]});
  else if(question==='invalid')frame({usage:{prompt_tokens:-1,completion_tokens:4},choices:[]});
  else if(question!=='missing'){
   frame({usage:{prompt_tokens:10,completion_tokens:2},choices:[]});
   frame({usage:question==='cache-small'?{prompt_tokens:20,completion_tokens:4,prompt_cache_hit_tokens:20,prompt_cache_miss_tokens:0}:question==='cache-large'?{prompt_tokens:100,completion_tokens:4,prompt_cache_hit_tokens:20,prompt_cache_miss_tokens:80}:{prompt_tokens:12,completion_tokens:4},choices:[]});
  }
  frame({choices:[{delta:{},finish_reason:question==='limited'?'length':toolCall?'tool_calls':'stop'}]});
  res.end('data: [DONE]\n\n');
 });
 await new Promise<void>(resolve=>remote.listen(0,'127.0.0.1',resolve));
 cleanup.push(()=>new Promise<void>(resolve=>{remote.closeAllConnections();remote.close(()=>resolve());}));
 const config={host:'127.0.0.1',port:0,configDir:join(directory,'config'),noOpen:true,demo:false};
 let host=await startServer(config);cleanup.push(()=>host.close());
 const workspace=await host.workspaces.select(root,actor);
 const settings:ModelSettings={id:'selected',baseUrl:'http://127.0.0.1:'+(remote.address() as {port:number}).port,model:'usage-model',credentialRef:'',capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:512}};
 await host.models.saveModelSettings(workspace.id,settings,'usage-test-private-key');
 const summary=async(id=workspace.id,modelId='selected')=>{
  const response=await fetch(host.url+'/api/v1/workspaces/'+id+'/settings/models/'+modelId+'/usage',{headers:{authorization:'Bearer '+host.auth.token}});
  expect(response.status).toBe(200);return response.json();
 };
 const generate=async(question:string)=>{
  const request:ModelRequest={messages:[{role:'user',content:question}],tools:[],maxOutputTokens:128};
  for await(const _event of host.capabilities.get(workspace.id,'model','selected').generate(request,new AbortController().signal)){}
 };
 return{get host(){return host;},workspace,settings,calls,summary,generate,root,directory,restart:async()=>{await host.close();host=await startServer(config);}};
}

describe('persisted model token usage',()=>{
 it('aggregates all workspace chats and model histories once with weighted cache coverage',async()=>{
  const s=await setup();
  const main=await s.host.sessions.createMain(s.workspace.id,'first');
  const temporary=await s.host.sessions.createTemporary(s.workspace.id,main.id);
  const otherMain=await s.host.sessions.createMain(s.workspace.id,'second');
  const ask=async(sessionId:typeof main.id,providerId='selected',question='count')=>{
   const run=await s.host.runs.submit({workspaceId:s.workspace.id,sessionId,question,documents:[],attachmentIds:[],providerId,requestId:randomUUID(),allowArtifactWrites:false},actor);
   for await(const _event of s.host.runs.events(s.workspace.id,run.runId,0,new AbortController().signal)){}
   expect(await s.host.runs.get(s.workspace.id,run.runId)).toMatchObject({status:'completed'});
  };
  await ask(main.id);await ask(temporary.id);await ask(otherMain.id);
  await s.host.models.saveModelSettings(s.workspace.id,{...s.settings,model:'changed-model'});
  await s.generate('missing');await s.generate('cache-small');
  await s.host.models.saveModelSettings(s.workspace.id,{...s.settings,id:'second',credentialRef:''},'second-test-key');
  await ask(otherMain.id,'second','cache-large');
  const usage=async(id=s.workspace.id)=>{
   const response=await fetch(s.host.url+'/api/v1/workspaces/'+id+'/usage',{headers:{authorization:'Bearer '+s.host.auth.token}});
   expect(response.status).toBe(200);return response.json();
  };
  expect(await usage()).toMatchObject({requests:6,reportedRequests:5,missingUsageRequests:1,inputTokens:156,outputTokens:20,totalTokens:176,cachedInputTokens:40,uncachedInputTokens:80,cacheEligibleInputTokens:120,cacheReportedRequests:2,cacheHitRate:1/3});
  await s.restart();expect(await usage()).toMatchObject({requests:6,totalTokens:176});
  const otherRoot=join(s.directory,'isolated');await mkdir(otherRoot);const other=await s.host.workspaces.select(otherRoot,actor);
  expect(await usage(other.id)).toMatchObject({requests:0,totalTokens:0,cacheHitRate:null,trackedSince:null});
  expect(JSON.stringify(await usage())).not.toContain('test-key');
 },serverIntegrationTimeout);

 it('counts each actual request once using its final reported usage, including the chat path',async()=>{
  const s=await setup();
  expect(await s.summary()).toMatchObject({requests:0,reportedRequests:0,lastRequest:null,trackedSince:null});
  const main=await s.host.sessions.createMain(s.workspace.id,'usage');
  const run=await s.host.runs.submit({workspaceId:s.workspace.id,sessionId:main.id,question:'count',documents:[],attachmentIds:[],providerId:'selected',requestId:randomUUID(),allowArtifactWrites:false},actor);
  for await(const _event of s.host.runs.events(s.workspace.id,run.runId,0,new AbortController().signal)){}
  expect((await s.host.runs.get(s.workspace.id,run.runId)).status).toBe('completed');
  await Promise.all([s.generate('one'),s.generate('two')]);
  expect(await s.summary()).toMatchObject({modelId:'selected',model:'usage-model',requests:3,reportedRequests:3,missingUsageRequests:0,inputTokens:36,outputTokens:12,totalTokens:48,lastRequest:{inputTokens:12,outputTokens:4,totalTokens:16,status:'completed'}});
  expect(s.calls.every(call=>(call.stream_options as {include_usage:boolean}).include_usage)).toBe(true);
 },serverIntegrationTimeout);

 it('marks absent, partial and invalid usage as unknown without inventing token counts',async()=>{
  const s=await setup();
  for(const question of ['missing','partial','invalid'])await s.generate(question);
  expect(await s.summary()).toMatchObject({requests:3,reportedRequests:0,missingUsageRequests:3,inputTokens:0,outputTokens:0,totalTokens:0,lastRequest:{inputTokens:null,outputTokens:null,totalTokens:null}});
 },serverIntegrationTimeout);

 it('retains paid usage on failed responses and marks cancelled streams as unreported',async()=>{
  const s=await setup();await expect(s.generate('limited')).rejects.toMatchObject({code:'MODEL_OUTPUT_LIMIT'});
  expect(await s.summary()).toMatchObject({requests:1,totalTokens:16,lastRequest:{status:'failed',totalTokens:16}});
  const controller=new AbortController();
  const stream=s.host.capabilities.get(s.workspace.id,'model','selected').generate({messages:[{role:'user',content:'cancel'}],tools:[],maxOutputTokens:128},controller.signal)[Symbol.asyncIterator]();
  expect((await stream.next()).value).toMatchObject({kind:'delta'});controller.abort();
  await expect(stream.next()).rejects.toThrow();
  expect(await s.summary()).toMatchObject({requests:2,reportedRequests:1,missingUsageRequests:1,totalTokens:16,lastRequest:{status:'cancelled',totalTokens:null}});
 },serverIntegrationTimeout);

 it('persists across restarts and capability edits while isolating models and workspaces',async()=>{
  const s=await setup();await s.generate('count');await s.restart();
  expect(await s.summary()).toMatchObject({requests:1,totalTokens:16});
  await s.host.models.saveModelSettings(s.workspace.id,{...s.settings,capabilities:{...s.settings.capabilities,maxOutputTokens:1024}});
  expect(await s.summary()).toMatchObject({requests:1,totalTokens:16});
  await s.host.models.saveModelSettings(s.workspace.id,{...s.settings,model:'other-model'});
  expect(await s.summary()).toMatchObject({model:'other-model',requests:0,lastRequest:null});
  await s.host.models.saveModelSettings(s.workspace.id,s.settings);
  expect(await s.summary()).toMatchObject({requests:1,totalTokens:16});
  const otherRoot=join(s.directory,'other');await mkdir(otherRoot);
  const other=await s.host.workspaces.select(otherRoot,actor);
  await s.host.models.saveModelSettings(other.id,s.settings,'other-test-key');
  expect(await s.summary(other.id)).toMatchObject({requests:0,lastRequest:null});
  expect(JSON.stringify(await s.summary())).not.toContain('usage-test-private-key');
 },serverIntegrationTimeout);

 it('includes every tool followup and document pre-read HTTP request in the same model totals',async()=>{
  const s=await setup();
  s.host.capabilities.register(s.workspace.id,'tool','usage-tool',{tools:[{name:'read_usage',inputSchema:{type:'object'},effect:'read',execute:async()=>({content:'tool result'})}]});
  const main=await s.host.sessions.createMain(s.workspace.id,'usage paths');
  const ask=async(question:string,documents:import('../../packages/contracts/src/documents.js').DocumentRef[]=[])=>{
   const run=await s.host.runs.submit({workspaceId:s.workspace.id,sessionId:main.id,question,documents,attachmentIds:[],providerId:'selected',requestId:randomUUID(),allowArtifactWrites:false},actor);
   for await(const _event of s.host.runs.events(s.workspace.id,run.runId,0,new AbortController().signal)){}
   expect(await s.host.runs.get(s.workspace.id,run.runId)).toMatchObject({status:'completed'});
  };
  await ask('tools');
  expect(await s.summary()).toMatchObject({requests:2,inputTokens:24,outputTokens:8,totalTokens:32});
  const pdf=await PDFDocument.create();pdf.addPage([200,200]).drawText('Token usage evidence.');
  await writeFile(join(s.root,'usage.pdf'),await pdf.save());
  await s.host.models.saveModelSettings(s.workspace.id,{...s.settings,capabilities:{...s.settings.capabilities,vision:true,maxOutputTokens:4096}});
  const document=await s.host.documents.open(s.workspace.id,'usage.pdf',new AbortController().signal);
  await ask('read document',[document]);
  expect(await s.summary()).toMatchObject({requests:5,reportedRequests:5,inputTokens:60,outputTokens:20,totalTokens:80});
  expect(s.calls).toHaveLength(5);
 },serverIntegrationTimeout);
});
