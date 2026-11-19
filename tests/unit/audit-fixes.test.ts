import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipSync} from 'fflate';
import {ModelMemoryProvider} from '../../packages/core/src/sessions/memory.js';
import {learnContextLimit,resetLearnedContextLimits} from '../../packages/core/src/models/context-window.js';
import {boundedUnzip} from '../../packages/core/src/documents/bounded-zip.js';
import {LocalSettings} from '../../packages/core/src/runtime/local-settings.js';
import {CredentialStore} from '../../packages/core/src/runtime/credentials.js';
import {HistorySearch} from '../../packages/core/src/sessions/history-search.js';
import {toolLoop} from '../../packages/core/src/runs/tool-loop.js';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
import {ModelSettingsService} from '../../packages/core/src/models/settings.js';
import {mkdir} from 'node:fs/promises';
import type {ModelProvider} from '../../packages/sdk/src/capabilities.js';
import type {ContextEnvelope} from '../../packages/contracts/src/sessions.js';
import type {RunId,RunScope,SessionId,WorkspaceId} from '../../packages/contracts/src/ids.js';

const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{
 resetLearnedContextLimits();
 for(const close of cleanup.splice(0).reverse())await close();
});

describe('audit regression fixes',()=>{
 it('ModelMemoryProvider respects learned effectiveContextWindow when chunking summaries',async()=>{
  const seenLengths:number[]=[];
  const model:ModelProvider={
   identity:'audit-learned-model',
   capabilities:{vision:false,tools:false,contextWindow:1_000_000},
   async *generate(request){
    seenLengths.push(JSON.stringify(request.messages).length);
    yield {kind:'delta',text:'summary chunk'};
    yield {kind:'done'};
   }
  };
  learnContextLimit(model,5000);
  const provider=new ModelMemoryProvider(()=>model);
  const big='x'.repeat(12000);
  const result=await provider.summarizeMessages([{role:'user',content:big}],500,new AbortController().signal);
  expect(result).toContain('summary chunk');
  expect(seenLengths.length).toBeGreaterThan(1);
 });

 it('boundedUnzip returns a null-prototype dictionary',()=>{
  const archive=zipSync({'hello.txt':new TextEncoder().encode('world')});
  const files=boundedUnzip(archive);
  expect(Object.getPrototypeOf(files)).toBeNull();
  expect(new TextDecoder().decode(files['hello.txt'])).toBe('world');
 });

 it('LocalSettings.get and CredentialStore readers do not reject when a concurrent write fails',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'audit-settings-'));
  cleanup.push(()=>rm(dir,{recursive:true,force:true}));
  const settings=new LocalSettings<{count:number}>(dir,'test',()=>({count:1}));
  const failedWrite=settings.update(async()=>{throw new Error('boom');});
  const handled=failedWrite.catch(error=>error as Error);
  const readValue=await settings.get();
  const err=await handled;
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe('boom');
  expect(readValue).toEqual({count:1});

  const creds=new CredentialStore(dir);
  await expect(creds.setSecret('bad ref!','x')).rejects.toMatchObject({code:'INVALID_CREDENTIAL'});
  expect(await creds.hasSecret('missing')).toBe(false);
 });

 it('HistorySearch.read rejects non-numeric cursor instead of returning empty results',async()=>{
  const history=new HistorySearch({} as never);
  const scope:RunScope={actor:{callerId:'local-owner',transport:'internal'},workspaceId:'ws' as WorkspaceId,sessionId:'s1' as SessionId,runId:'r1' as RunId,allowArtifactWrites:false};
  await expect(history.read(scope,'s1' as SessionId,'not-a-number')).rejects.toMatchObject({code:'INVALID_CURSOR'});
  await expect(history.read(scope,'s1' as SessionId,'-1')).rejects.toMatchObject({code:'INVALID_CURSOR'});
 });

 it('toolLoop inserts a paragraph break between tool-round preamble text and final answer',async()=>{
  let call=0;
  const model:ModelProvider={
   identity:'audit-loop-sep',
   capabilities:{vision:false,tools:true,contextWindow:100_000},
   async *generate(){
    call++;
    if(call===1){
     yield {kind:'delta',text:'Checking page 1.'};
     yield {kind:'tool-call',id:'tc-1',name:'ping',input:{}};
     yield {kind:'done'};
    }else{
     yield {kind:'delta',text:'Final answer.'};
     yield {kind:'done'};
    }
   }
  };
  const envelope:ContextEnvelope={
   workspaceId:'ws' as WorkspaceId,sessionId:'s1' as SessionId,mainRevision:0,ownRevision:0,
   documents:[],messages:[{role:'system',content:'sys'},{role:'user',content:'question'}],
   sourceRanges:[],budget:{limit:100_000,inputTokens:20,reservedOutputTokens:0,estimated:true},summaryCoverage:[]
  };
  const scope:RunScope={actor:{callerId:'local-owner',transport:'internal'},workspaceId:'ws' as WorkspaceId,sessionId:'s1' as SessionId,runId:'r1' as RunId,allowArtifactWrites:false};
  const executor={execute:async()=>({content:'ok'})} as unknown as Parameters<typeof toolLoop>[4];
  const deltas:string[]=[];
  const result=await toolLoop(model,envelope,[],scope,executor,async(kind,data)=>{if(kind==='delta')deltas.push((data as {text:string}).text);},new AbortController().signal);
  expect(result.answer).toBe('Checking page 1.\n\nFinal answer.');
  expect(deltas.join('')).toBe('Checking page 1.\n\nFinal answer.');
 });

 it('ModelSettingsService.deleteModelSettings removes saved profile, credential and capability',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'audit-model-delete-'));
  cleanup.push(()=>rm(dir,{recursive:true,force:true}));
  const root=join(dir,'ws');await mkdir(root);
  const workspaces=new WorkspaceService(join(dir,'config'));cleanup.push(()=>workspaces.close());
  const capabilities=new CapabilityRegistry();
  const models=new ModelSettingsService(workspaces,capabilities);
  const workspace=await workspaces.select(root,{callerId:'local-owner',transport:'internal'});
  await models.saveModelSettings(workspace.id,{id:'custom-1',baseUrl:'https://api.example.com/v1',model:'m1',credentialRef:'',capabilities:{vision:false,tools:true,contextWindow:1_000_000}},'sk-test-123',{create:true});
  expect((await models.listModelSettings(workspace.id)).map(m=>m.id)).toEqual(['custom-1']);
  expect(await models.credentials.hasSecret('model.custom-1')).toBe(true);
  await expect(models.deleteModelSettings(workspace.id,'demo')).rejects.toMatchObject({code:'MODEL_SETTINGS_INVALID'});
  await models.deleteModelSettings(workspace.id,'custom-1');
  expect(await models.listModelSettings(workspace.id)).toEqual([]);
  expect(await models.credentials.hasSecret('model.custom-1')).toBe(false);
  expect(capabilities.list(workspace.id,'model')).not.toContain('custom-1');
 });
});
