import {afterEach,describe,expect,it} from 'vitest';import {createServer} from 'node:http';import {mkdtemp,mkdir,rm,readFile,copyFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {OpenAICompatibleProvider} from '../../packages/core/src/models/openai-compatible.js';import {CredentialStore} from '../../packages/core/src/runtime/credentials.js';import {startServer} from '../../apps/server/src/app.js';
import type {ModelRequest,ModelSettings,ModelEvent} from '../../packages/contracts/src/models.js';import type {AskRequest} from '../../packages/contracts/src/sessions.js';import type {RunRecord} from '../../packages/contracts/src/runs.js';
import {frame,textFrames,toolFrames} from '../fixtures/openai-streams.js';
import {serverIntegrationTimeout,serverIntegrationStages} from '../helpers/server-integration.js';
const actor={callerId:'local-owner',transport:'internal' as const},testKey='sk-protocol-private';const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function directory(){const dir=await mkdtemp(join(tmpdir(),'reader model '));cleanup.push(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function endpoint(mode='text'){
 const requests:Array<{path:string;authorization?:string;body:Record<string,unknown>}>=[];let aborted=false;
 const server=createServer(async(req,res)=>{
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');return;}
  const body=await new Promise<string>(resolve=>{let text='';req.setEncoding('utf8');req.on('data',part=>text+=part);req.on('end',()=>resolve(text));});requests.push({path:req.url!,authorization:req.headers.authorization,body:body?JSON.parse(body):{}});
  if(mode==='401'||mode==='429'||mode==='context'){res.writeHead(mode==='context'?400:Number(mode),{'content-type':'application/json'});res.end(JSON.stringify({error:{code:mode==='context'?'context_length_exceeded':'invalid_api_key',message:testKey}}));return;}
  res.writeHead(200,{'content-type':'text/event-stream'});res.on('close',()=>{aborted=true;});
  if(mode==='slow'||mode==='slow-first'&&JSON.stringify(requests.at(-1)?.body.messages).includes('FIRST')){res.write('data: '+JSON.stringify(frame({content:'开始'}))+'\n\n');return;}
  const chunks=(mode==='tools'||mode==='tools-then-text'&&requests.length===1)?toolFrames:mode==='echo-key'?[frame({content:testKey.slice(0,9)}),frame({content:testKey.slice(9)}),frame({},'stop')]:mode==='echo-tool'?[frame({tool_calls:[{index:0,id:'secret',function:{name:'read',arguments:JSON.stringify({value:testKey})}}]}),frame({},'tool_calls')]:mode==='cut'?[frame({content:'未完'})]:mode==='invalid'?[frame({tool_calls:[{index:0,id:'bad',function:{name:'read',arguments:'{bad'}}]}),frame({},'tool_calls')]:textFrames;
  for(const chunk of chunks){const pretty=JSON.stringify(chunk,null,2).split('\n').map(line=>'data: '+line).join('\r\n');const bytes=Buffer.from(': heartbeat\r\n'+pretty+'\r\n\r\n');for(let index=0;index<bytes.length;index+=2)res.write(bytes.subarray(index,index+2));}
  res.end(mode==='cut'?'':'data: [DONE]\n\n');
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));const port=(server.address() as {port:number}).port;
 return{url:'http://127.0.0.1:'+port,requests,get aborted(){return aborted;}};
}
const request:ModelRequest={messages:[{role:'user',content:'你好'}],tools:[],maxOutputTokens:128};
async function configured(url:string,options:Partial<ModelSettings>={}){
 const dir=await directory(),credentials=new CredentialStore(join(dir,'config'));await credentials.setSecret('test',testKey);
 const settings:ModelSettings={id:'test',baseUrl:url+'/api/',model:'real-protocol-model',credentialRef:'test',capabilities:{vision:true,tools:true,contextWindow:32000,maxOutputTokens:512},...options};
 return{provider:new OpenAICompatibleProvider(settings,credentials),settings,credentials};
}
async function events(provider:OpenAICompatibleProvider,req=request){const result:ModelEvent[]=[];for await(const event of provider.generate(req,new AbortController().signal))result.push(event);return result;}
describe('OpenAI-compatible HTTP protocol',()=>{
 it('omits output token limits even when legacy clients or plugins provide them',async()=>{
  const remote=await endpoint(),{provider}=await configured(remote.url);
  await events(provider,{...request,maxOutputTokens:1000000});
  expect(remote.requests).toHaveLength(1);
  for(const field of ['max_tokens','max_completion_tokens','max_output_tokens'])expect(remote.requests[0]!.body).not.toHaveProperty(field);
  expect(provider.capabilities.contextWindow).toBe(1000000);
 });
 it('rejects input beyond one million tokens before sending any HTTP request',async()=>{
  const remote=await endpoint(),{provider}=await configured(remote.url);
  await expect(events(provider,{...request,messages:[{role:'user',content:'文'.repeat(1000001)}]})).rejects.toMatchObject({code:'CONTEXT_LIMIT'});
  expect(remote.requests).toHaveLength(0);
 });
 it('preserves endpoint paths and decodes split UTF8, multiline data, usage and completion',async()=>{
  const remote=await endpoint(),{provider}=await configured(remote.url);const received=await events(provider);expect(received.filter(e=>e.kind==='delta').map(e=>e.kind==='delta'?e.text:'').join('')).toBe('中文回答');expect(received).toContainEqual({kind:'usage',inputTokens:12,outputTokens:4});expect(received.at(-1)?.kind).toBe('done');expect(remote.requests[0]?.path).toBe('/api/chat/completions');expect(remote.requests[0]?.authorization).toBe('Bearer '+testKey);
 });
 it('assembles interleaved tool arguments only after full JSON and preserves model reasoning for tool followups',async()=>{
  const remote=await endpoint('tools'),{provider}=await configured(remote.url);const received=await events(provider);expect(received.filter(e=>e.kind==='tool-call')).toEqual([{kind:'tool-call',id:'c0',name:'read',input:{a:1}},{kind:'tool-call',id:'c1',name:'search',input:{q:'中文'}}]);expect(received.some(e=>e.kind==='reasoning')).toBe(true);
  const bad=await endpoint('invalid'),config=await configured(bad.url);await expect(events(config.provider)).rejects.toMatchObject({code:'TOOL_INPUT_INVALID'});
 });
 it('sends the previous reasoning and both actual tool results in the second HTTP request',async()=>{
  const dir=await directory(),root=join(dir,'work');await mkdir(root);const remote=await endpoint('tools-then-text');const server=await startServer({host:'127.0.0.1',port:0,configDir:join(dir,'config'),noOpen:true,demo:false});cleanup.push(()=>server.close());const workspace=await server.workspaces.select(root,actor),main=await server.sessions.createMain(workspace.id,'tools');
  server.capabilities.register(workspace.id,'tool','protocol',{tools:['read','search'].map(name=>({name,inputSchema:{type:'object'},effect:'read' as const,execute:async()=>({content:'实际工具结果 '+name})}))});
  await server.models.saveModelSettings(workspace.id,{id:'protocol',baseUrl:remote.url,model:'protocol',credentialRef:'',capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:512}},testKey);
  const run=await server.runs.submit({workspaceId:workspace.id,sessionId:main.id,question:'调用工具',documents:[],attachmentIds:[],providerId:'protocol',requestId:randomUUID(),allowArtifactWrites:true},actor);for await(const _ of server.runs.events(workspace.id,run.runId,0,new AbortController().signal)){}expect((await server.runs.get(workspace.id,run.runId)).status).toBe('completed');expect(remote.requests).toHaveLength(2);
  const sent=remote.requests[1]?.body.messages as Array<{role:string;reasoning_content?:string;content:string}>;expect(sent.find(m=>m.role==='assistant')?.reasoning_content).toBe('模型返回的思考片段');expect(sent.filter(m=>m.role==='tool').map(m=>m.content)).toEqual(['实际工具结果 read','实际工具结果 search']);
 },serverIntegrationTimeout);
 it('reports authentication, rate, capacity and interruption errors without reflected secrets',async()=>{
  for(const [mode,code] of [['401','MODEL_AUTHENTICATION_FAILED'],['429','MODEL_RATE_LIMIT'],['context','CONTEXT_LIMIT'],['cut','MODEL_STREAM_INTERRUPTED']]){const remote=await endpoint(mode),{provider}=await configured(remote.url);try{await events(provider);throw new Error('expected error');}catch(error){expect(error).toMatchObject({code});expect(String(error)).not.toContain(testKey);}}
 });
 it('rejects unsupported images before HTTP and aborts the actual open stream',async()=>{
  const remote=await endpoint('slow'),{provider}=await configured(remote.url,{capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:512}});
  await expect(events(provider,{...request,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AAAA'}}]}]})).rejects.toMatchObject({code:'VISION_UNAVAILABLE'});expect(remote.requests).toHaveLength(0);
  const controller=new AbortController();const stream=provider.generate(request,controller.signal)[Symbol.asyncIterator]();expect((await stream.next()).value).toMatchObject({kind:'delta',text:'开始'});controller.abort();await expect(stream.next()).rejects.toThrow();await delay(30);expect(remote.aborted).toBe(true);
 });
 it('sends actual thinking depth controls and freezes credentials for an active provider instance',async()=>{
  const remote=await endpoint(),{provider,credentials}=await configured(remote.url,{capabilities:{vision:true,tools:true,contextWindow:32000,maxOutputTokens:512,reasoningEfforts:['none','low','high','max'],defaultReasoningEffort:'high'},reasoningFormat:'deepseek'});
  for(const reasoningEffort of ['none','low','max'])await events(provider,{...request,reasoningEffort});expect(remote.requests.map(r=>r.body.reasoning_effort)).toEqual(['none','low','max']);expect(remote.requests[0]?.body.thinking).toEqual({type:'disabled'});expect(remote.requests[1]?.body.thinking).toEqual({type:'enabled'});
  await expect(events(provider,{...request,reasoningEffort:'medium'})).rejects.toMatchObject({code:'REASONING_UNSUPPORTED'});await credentials.setSecret('test','replacement-key');await events(provider);expect(remote.requests.at(-1)?.authorization).toBe('Bearer '+testKey);
 });
 it('redacts a reflected credential across text chunks and refuses credential-bearing tool inputs',async()=>{
  const remote=await endpoint('echo-key'),{provider}=await configured(remote.url);const result=await events(provider);expect(JSON.stringify(result)).not.toContain(testKey);expect(result.filter(e=>e.kind==='delta').map(e=>e.kind==='delta'?e.text:'').join('')).toContain('已隐藏凭据');
  const toolRemote=await endpoint('echo-tool'),toolProvider=await configured(toolRemote.url);await expect(events(toolProvider.provider)).rejects.toMatchObject({code:'MODEL_SECRET_REFLECTED'});
 });
 it('saves only credential references, reloads settings and registers demo only explicitly',async()=>{
  const dir=await directory(),root=join(dir,'work');await mkdir(root);const config={host:'127.0.0.1',port:0,configDir:join(dir,'config'),noOpen:true,demo:false};const remote=await endpoint('401');let server=await startServer(config);cleanup.push(()=>server.close());const workspace=await server.workspaces.select(root,actor);expect(server.capabilities.list(workspace.id,'model')).not.toContain('demo');
  const headers={authorization:'Bearer '+server.auth.token,'content-type':'application/json'};const saved=await fetch(server.url+'/api/v1/workspaces/'+workspace.id+'/settings/models',{method:'PUT',headers,body:JSON.stringify({settings:{id:'official',baseUrl:remote.url,model:'test',credentialRef:'',capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:512}},key:testKey})});expect(saved.status).toBe(200);expect(JSON.stringify(await saved.json())).not.toContain(testKey);
  const main=await server.sessions.createMain(workspace.id,'test');const ask:AskRequest={workspaceId:workspace.id,sessionId:main.id,question:'test',documents:[],attachmentIds:[],providerId:'official',requestId:randomUUID(),allowArtifactWrites:true};const submitted=await server.runs.submit(ask,actor);const publicEvents=[];for await(const event of server.runs.events(workspace.id,submitted.runId,0,new AbortController().signal))publicEvents.push(event);const failed=await server.runs.get(workspace.id,submitted.runId) as RunRecord;expect(failed.error?.code).toBe('MODEL_AUTHENTICATION_FAILED');expect(JSON.stringify([failed,publicEvents])).not.toContain(testKey);
  const stored=(await server.workspaces.storeFor(workspace.id)).getRecord('model-settings','official');expect(JSON.stringify(stored)).not.toContain(testKey);await server.close();server=await startServer(config);expect((await server.models.listModelSettings(workspace.id))[0]).toMatchObject({id:'official',hasKey:true});expect(server.capabilities.list(workspace.id,'model')).toContain('official');
  const demo=await startServer({...config,configDir:join(dir,'demo'),demo:true});cleanup.push(()=>demo.close());expect(demo.capabilities.list(workspace.id,'model')).toContain('demo');
 },serverIntegrationTimeout);
 it('uses only configured read OCR on an authorized local image and never sends it to a text-only endpoint',async()=>{
  const stage=serverIntegrationStages('model-ocr');const dir=await directory(),root=join(dir,'work');await mkdir(root);await copyFile('tests/fixtures/assets/diagram.png',join(root,'diagram.png'));const remote=await endpoint();const server=await stage('server-startup',()=>startServer({host:'127.0.0.1',port:0,configDir:join(dir,'config'),noOpen:true,demo:false}));cleanup.push(()=>stage('server-close',()=>server.close()));const workspace=await stage('workspace-selection',()=>server.workspaces.select(root,actor));
  await stage('plugin-disable',()=>server.plugins.disable('visual-document-memory',workspace.id));let calls=0,ocrText='图中文字 RI 和 CQI';server.capabilities.register(workspace.id,'tool','ocr',{tools:[{name:'ocr_page',inputSchema:{type:'object'},effect:'read',execute:async(input)=>{calls++;expect((input as {image:{dataBase64:string}}).image.dataBase64.length).toBeGreaterThan(100);return{content:ocrText};}}]});
  await stage('model-configuration',()=>server.models.saveModelSettings(workspace.id,{id:'text',baseUrl:remote.url,model:'text',credentialRef:'',capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:512},ocrToolId:'ocr_page'},testKey));
  const document=await stage('image-open',()=>server.documents.open(workspace.id,'diagram.png',new AbortController().signal)),main=await stage('session-create',()=>server.sessions.createMain(workspace.id,'OCR'));const result=await stage('ocr-submit',()=>server.runs.submit({workspaceId:workspace.id,sessionId:main.id,question:'读图中文字',documents:[document],attachmentIds:[],providerId:'text',requestId:randomUUID(),allowArtifactWrites:true},actor));await stage('ocr-events',async()=>{for await(const _event of server.runs.events(workspace.id,result.runId,0,new AbortController().signal)){}});expect((await server.runs.get(workspace.id,result.runId)).status).toBe('completed');expect(calls).toBe(1);expect(JSON.stringify(remote.requests[0]?.body.messages)).toContain('图中文字 RI');expect(JSON.stringify(remote.requests[0]?.body.messages)).not.toContain('data:image/');
  ocrText='';const empty=await stage('empty-ocr-submit',()=>server.runs.submit({workspaceId:workspace.id,sessionId:main.id,question:'再次读图',documents:[document],attachmentIds:[],providerId:'text',requestId:randomUUID(),allowArtifactWrites:true},actor));await stage('empty-ocr-events',async()=>{for await(const _event of server.runs.events(workspace.id,empty.runId,0,new AbortController().signal)){}});expect((await server.runs.get(workspace.id,empty.runId)).error?.code).toBe('OCR_EMPTY');expect(remote.requests).toHaveLength(1);
 },serverIntegrationTimeout);
 it('freezes queued model settings and carries the selected effort through the agent loop',async()=>{
  const dir=await directory(),root=join(dir,'work');await mkdir(root);const old=await endpoint('slow-first'),next=await endpoint();const server=await startServer({host:'127.0.0.1',port:0,configDir:join(dir,'config'),noOpen:true,demo:false});cleanup.push(()=>server.close());const workspace=await server.workspaces.select(root,actor),main=await server.sessions.createMain(workspace.id,'queue');
  const settings:ModelSettings={id:'same',baseUrl:old.url,model:'original',credentialRef:'',reasoningFormat:'deepseek',capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:512,reasoningEfforts:['none','low','high','max'],defaultReasoningEffort:'high'}};
  await server.models.saveModelSettings(workspace.id,settings,testKey);const ask=(question:string):AskRequest=>({workspaceId:workspace.id,sessionId:main.id,question,documents:[],attachmentIds:[],providerId:'same',requestId:randomUUID(),allowArtifactWrites:true,reasoningEffort:'none'});
  const first=await server.runs.submit(ask('FIRST'),actor);for await(const event of server.runs.events(workspace.id,first.runId,0,new AbortController().signal)){if(event.kind==='delta')break;}
  const queued=await server.runs.submit(ask('QUEUED'),actor);await server.models.saveModelSettings(workspace.id,{...settings,baseUrl:next.url,model:'replacement'},'new-key');await server.runs.cancel(workspace.id,first.runId,actor);
  for await(const _event of server.runs.events(workspace.id,queued.runId,0,new AbortController().signal)){}expect((await server.runs.get(workspace.id,queued.runId)).status).toBe('completed');expect(old.requests).toHaveLength(2);expect(next.requests).toHaveLength(0);expect(old.requests[1]?.body.model).toBe('original');expect(old.requests[1]?.body.reasoning_effort).toBe('none');expect(old.requests[1]?.authorization).toBe('Bearer '+testKey);
 },serverIntegrationTimeout);
});
