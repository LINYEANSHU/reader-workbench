import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {startServer} from '../../apps/server/src/app.js';
import {CredentialStore} from '../../packages/core/src/runtime/credentials.js';
import {defaultAgentSettings} from '../../packages/contracts/src/agent-settings.js';
import {serverIntegrationTimeout} from '../helpers/server-integration.js';

const actor={callerId:'local-owner',transport:'internal' as const};
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function setup(){
 const directory=await mkdtemp(join(tmpdir(),'reader global settings '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const roots=[join(directory,'first'),join(directory,'second')];await Promise.all(roots.map(root=>mkdir(root)));
 const config={host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:false,noOpen:true};
 let host=await startServer(config);cleanup.push(()=>host.close());
 const first=await host.workspaces.select(roots[0]!,actor),second=await host.workspaces.select(roots[1]!,actor);
 return{get host(){return host;},first,second,config,restart:async()=>{await host.close();host=await startServer(config);}};
}
const model={id:'shared',baseUrl:'https://example.com/v1',model:'shared-model',credentialRef:'',capabilities:{vision:false,tools:true,contextWindow:1000000}};

it('uses a rotated key in every opened workspace while an existing provider lease retains its key',async()=>{
 const s=await setup(),authorizations:string[]=[];
 const remote=createServer((request,response)=>{request.resume();authorizations.push(request.headers.authorization??'');response.writeHead(200,{'content-type':'text/event-stream'});response.end('data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');});
 await new Promise<void>(resolve=>remote.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise<void>((resolve,reject)=>remote.close(error=>error?reject(error):resolve())));
 const settings={...model,baseUrl:'http://127.0.0.1:'+(remote.address() as {port:number}).port};
 const run=async(provider:any)=>{for await(const _ of provider.generate({messages:[{role:'user',content:'hello'}],tools:[]},new AbortController().signal)){};};
 await s.host.models.saveModelSettings(s.first.id,settings,'fixture-first-key');await s.host.models.listModelSettings(s.second.id);
 const lease=s.host.capabilities.acquire(s.first.id,'model','shared');
 try{
  await run(lease.value);await run(s.host.capabilities.get(s.second.id,'model','shared'));
  await s.host.models.saveModelSettings(s.first.id,settings,'fixture-replacement-key');
  await run(s.host.capabilities.get(s.first.id,'model','shared'));await run(s.host.capabilities.get(s.second.id,'model','shared'));await run(lease.value);
  expect(authorizations).toEqual(['Bearer fixture-first-key','Bearer fixture-first-key','Bearer fixture-replacement-key','Bearer fixture-replacement-key','Bearer fixture-first-key']);
 }finally{lease.release();}
},serverIntegrationTimeout);

it('shares model connections and prompt preferences across workspaces and restart without storing them in a workspace',async()=>{
 const s=await setup();await s.host.models.saveModelSettings(s.first.id,model,'fixture-global-key');
 expect(await s.host.models.listModelSettings(s.second.id)).toMatchObject([{id:'shared',hasKey:true}]);
 const preferences={...defaultAgentSettings(),personalPrompt:'跨工作区的个人偏好'};
 await s.host.context.agentSettings.save(s.first.id,preferences);
 expect(await s.host.context.agentSettings.get(s.second.id)).toEqual(preferences);
 for(const workspace of [s.first,s.second]){
  const store=await s.host.workspaces.storeFor(workspace.id);
  expect(store.listRecords('model-settings')).toEqual([]);expect(store.getRecord('agent-settings','preferences')).toBeNull();
 }
 expect(await readFile(join(s.config.configDir,'agent','models.json'),'utf8')).not.toContain('fixture-global-key');
 expect(await new CredentialStore(join(s.config.configDir,'agent')).getSecret('model.shared')).toBe('fixture-global-key');
 await s.restart();expect(await s.host.models.listModelSettings(s.second.id)).toMatchObject([{id:'shared',hasKey:true}]);
 expect(await s.host.context.agentSettings.get(s.first.id)).toEqual(preferences);
},serverIntegrationTimeout);

it('migrates legacy connections and credentials without overwriting a conflicting global connection',async()=>{
 const s=await setup();await s.host.models.saveModelSettings(s.first.id,model,'global-key');
 const legacy={...model,model:'legacy-model',credentialRef:'model.'+s.second.id+'.shared'};
 const store=await s.host.workspaces.storeFor(s.second.id);store.putRecord('model-settings','shared',legacy);
 const oldUsageKey=createHash('sha256').update(JSON.stringify(['shared','https://example.com/v1/chat/completions','legacy-model'])).digest('hex');
 store.putRecord('model-usage',oldUsageKey,{modelId:'shared',model:'legacy-model',requests:2,totalTokens:33,inputTokens:30,outputTokens:3,reportedRequests:2,missingUsageRequests:0,trackedSince:'2026-10-01',lastRequest:null});
 await new CredentialStore(s.config.configDir).setSecret(legacy.credentialRef,'legacy-key');
 const migrated=await s.host.models.listModelSettings(s.second.id);
 expect(migrated).toHaveLength(2);expect(migrated.find(item=>item.id==='shared')).toMatchObject({model:'shared-model',hasKey:true});
 const imported=migrated.find(item=>item.model==='legacy-model')!;expect(imported.id).not.toBe('shared');expect(imported.hasKey).toBe(true);
 expect(imported.migratedFrom).toBe('shared');expect(await s.host.models.usage(s.second.id,imported.id)).toMatchObject({modelId:imported.id,totalTokens:33});
 expect(await s.host.models.workspaceUsage(s.second.id)).toMatchObject({requests:2,totalTokens:33});
 expect(await s.host.models.credentials.getSecret(imported.credentialRef)).toBe('legacy-key');
 expect(store.listRecords('model-settings')).toEqual([]);
 expect(await s.host.models.listModelSettings(s.first.id)).toHaveLength(2);
 await s.restart();expect(await s.host.models.listModelSettings(s.second.id)).toHaveLength(2);
},serverIntegrationTimeout);

it('preserves distinct long connection names and their different keys during collision migration',async()=>{
 const s=await setup(),prefix='long-connection-prefix-'.repeat(2),ids=[prefix+'first',prefix+'second'];
 for(const [index,id] of ids.entries())await s.host.models.saveModelSettings(s.first.id,{...model,id},'global-'+index);
 const store=await s.host.workspaces.storeFor(s.second.id),credentials=new CredentialStore(s.config.configDir);
 for(const [index,id] of ids.entries()){const credentialRef='model.'+s.second.id+'.'+id;store.putRecord('model-settings',id,{...model,id,credentialRef});await credentials.setSecret(credentialRef,'legacy-'+index);}
 const migrated=await s.host.models.listModelSettings(s.second.id);expect(migrated).toHaveLength(4);
 for(const [index,id] of ids.entries()){const imported=migrated.find(item=>item.migratedFrom===id)!;expect(imported).toBeDefined();expect(await s.host.models.credentials.getSecret(imported.credentialRef)).toBe('legacy-'+index);}
 expect(store.listRecords('model-settings')).toEqual([]);
 await s.restart();expect(await s.host.models.listModelSettings(s.second.id)).toHaveLength(4);
},serverIntegrationTimeout);

it('archives and restores a main conversation without removing its history or temporary branches',async()=>{
 const s=await setup(),main=await s.host.sessions.createMain(s.first.id,'保留的对话'),temporary=await s.host.sessions.createTemporary(s.first.id,main.id);
 const request=async(id:string,body:unknown)=>{
  const result=await fetch(s.host.url+'/api/v1/workspaces/'+s.first.id+'/sessions/'+id+'/archive',{method:'PUT',headers:{authorization:'Bearer '+s.host.auth.token,'content-type':'application/json'},body:JSON.stringify(body)});
  return{status:result.status,data:await result.json()};
 };
 expect((await request(main.id,{archived:true})).status).toBe(200);
 expect((await s.host.sessions.list(s.first.id)).find(item=>item.id===main.id)).toHaveProperty('archivedAt',expect.any(String));
 expect((await s.host.sessions.getHistory(s.first.id,main.id)).session.title).toBe('保留的对话');
 expect((await s.host.sessions.list(s.first.id)).find(item=>item.id===temporary.id)).toBeDefined();
 expect((await request(temporary.id,{archived:true})).status).toBe(400);
 expect((await request(main.id,{archived:'yes'})).status).toBe(400);
 await s.restart();expect((await s.host.sessions.list(s.first.id)).find(item=>item.id===main.id)).toHaveProperty('archivedAt',expect.any(String));
 expect((await request(main.id,{archived:false})).status).toBe(200);
 expect((await s.host.sessions.list(s.first.id)).find(item=>item.id===main.id)?.archivedAt).toBeUndefined();
},serverIntegrationTimeout);

it('creates new model connections without replacing an existing one or reusing its key for another service',async()=>{
 const s=await setup();await s.host.models.saveModelSettings(s.first.id,model,'fixture-original-key');
 await expect(s.host.models.saveModelSettings(s.first.id,{...model,model:'replacement'},undefined,{create:true})).rejects.toMatchObject({code:'MODEL_ID_CONFLICT'});
 expect(await s.host.models.listModelSettings(s.first.id)).toMatchObject([{id:'shared',model:'shared-model',hasKey:true}]);
 await s.host.models.saveModelSettings(s.first.id,{...model,id:'shared-2',model:'second'},undefined,{create:true});
 expect(await s.host.models.listModelSettings(s.first.id)).toMatchObject([{id:'shared',model:'shared-model',hasKey:true},{id:'shared-2',model:'second',hasKey:false}]);
 await expect(s.host.models.saveModelSettings(s.first.id,{...model,baseUrl:'https://other.example/v1'})).rejects.toMatchObject({code:'CREDENTIAL_REQUIRED'});
 await s.host.models.saveModelSettings(s.first.id,{...model,baseUrl:'https://example.com/v2',model:'edited'});
 await s.host.models.saveModelSettings(s.first.id,{...model,baseUrl:'https://other.example/v1'},'fixture-other-key');
 expect((await s.host.models.listModelSettings(s.first.id)).find(item=>item.id==='shared')).toMatchObject({baseUrl:'https://other.example/v1',hasKey:true});
},serverIntegrationTimeout);
