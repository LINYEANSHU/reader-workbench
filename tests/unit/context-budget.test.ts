import {afterEach,describe,expect,it} from 'vitest';
import {estimateTokens,ContextBuilder} from '../../packages/core/src/sessions/context.js';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {SessionRepository} from '../../packages/core/src/sessions/repository.js';
import {SessionService} from '../../packages/core/src/sessions/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
import type {RunId} from '../../packages/contracts/src/ids.js';
import type {AskRequest} from '../../packages/contracts/src/sessions.js';
import {ModelMemoryProvider} from '../../packages/core/src/sessions/memory.js';
import type {CommittedTurn} from '../../packages/contracts/src/sessions.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
describe('context budget',()=>{
 it('uses a conservative UTF-8 estimate for Chinese and reserves message overhead',()=>{expect(estimateTokens('中文')).toBeGreaterThanOrEqual(6);expect(estimateTokens('RI')).toBeGreaterThanOrEqual(2);});
 it('uses the selected model for summaries and refuses an empty model result',async()=>{
  let calls=0;
  const turns:CommittedTurn[]=[{id:'archived-turn',runId:'r' as RunId,question:'实际旧问题',answer:'实际旧回答',revision:1,messages:[{role:'user',content:'实际旧问题'},{role:'assistant',content:'实际旧回答'}],sourceAnchors:[],attachmentIds:[]}];
  const memory=new ModelMemoryProvider(()=>({capabilities:{vision:false,tools:false,contextWindow:1024,maxOutputTokens:16,reasoningEfforts:['none','high'],defaultReasoningEffort:'high'},generate:async function*(request){calls++;expect(request.tools).toEqual([]);expect(request.maxOutputTokens).toBeLessThanOrEqual(16);expect(request.reasoningEffort).toBe('none');yield {kind:'delta',text:'来自模型的摘要'};yield {kind:'done'};}}));
  const summary=await memory.summarize(turns,128,new AbortController().signal);
  expect(calls).toBeGreaterThan(0);expect(summary.turnIds).toEqual(['archived-turn']);expect(summary.text).toContain('来自模型');
  const empty=new ModelMemoryProvider(()=>({capabilities:{vision:false,tools:false,contextWindow:1024,maxOutputTokens:128},generate:async function*(){yield {kind:'done'};}}));
  await expect(empty.summarize(turns,128,new AbortController().signal)).rejects.toMatchObject({code:'MEMORY_SUMMARY_FAILED'});
  const incomplete=new ModelMemoryProvider(()=>({capabilities:{vision:false,tools:false,contextWindow:1024,maxOutputTokens:128},generate:async function*(){yield {kind:'delta',text:'未完成摘要'};}}));
  await expect(incomplete.summarize(turns,128,new AbortController().signal)).rejects.toMatchObject({code:'MEMORY_SUMMARY_FAILED'});
 });
 it('keeps selection, recent turns, source coverage and retrievable archives while leaving parent unchanged',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reader budget '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const root=join(directory,'A');await mkdir(root);await writeFile(join(root,'selected.md'),'选区最优先，保留原始来源。');
  const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());const actor={callerId:'local-owner',transport:'internal' as const};const workspace=await workspaces.select(root,actor);
  const registry=new CapabilityRegistry();registry.register(workspace.id,'model','small',{capabilities:{vision:false,tools:false,contextWindow:6000,maxOutputTokens:256},generate:async function*(){yield {kind:'done'};}});
  registry.register(workspace.id,'memory','test-summary',{summarize:async turns=>({text:turns.map(turn=>turn.question.slice(0,12)+' → '+turn.answer.slice(0,12)).join('\n'),turnIds:turns.map(turn=>turn.id),revision:turns.at(-1)?.revision??0})});
  const repository=new SessionRepository(workspaces),sessions=new SessionService(repository),documents=new DocumentService(workspaces,registry);cleanup.push(()=>documents.close());const context=new ContextBuilder(repository,documents,registry);
  const main=await sessions.createMain(workspace.id,'long history');const temporary=await sessions.createTemporary(workspace.id,main.id);
  for(let index=0;index<12;index++){
   const scope={actor,workspaceId:workspace.id,sessionId:main.id,runId:randomUUID() as RunId,allowArtifactWrites:true};const release=await repository.registerScope(scope);
   const question='问题 '+index+' '+ '中'.repeat(180),answer='回答 '+index+' '+ '文'.repeat(240);
   await repository.completeOwnTurn(scope,{id:randomUUID(),runId:scope.runId,question,answer,messages:[{role:'user',content:question},{role:'assistant',content:answer}],sourceAnchors:[],attachmentIds:[]});release();
  }
  const parentBefore=await sessions.getHistory(workspace.id,main.id);
  const document=await documents.open(workspace.id,'selected.md',new AbortController().signal);await documents.waitReady(document,new AbortController().signal);
  const anchor=(await documents.readPage(document,1)).anchors[0]!;
  const request:AskRequest={workspaceId:workspace.id,sessionId:temporary.id,question:'解释选区',documents:[document],selection:{text:'选区最优先',anchors:[anchor]},attachmentIds:[],providerId:'small',requestId:randomUUID(),allowArtifactWrites:false};
  const envelope=await context.build(request,new AbortController().signal);
  const text=envelope.messages.map(message=>message.content).join('\n');
  expect(text).toContain('选区最优先');expect(text).toContain('问题 11');expect(envelope.summaryCoverage.length).toBeGreaterThan(0);
  expect(envelope.budget.inputTokens+envelope.budget.reservedOutputTokens).toBeLessThanOrEqual(envelope.budget.limit);
  expect(await sessions.getHistory(workspace.id,main.id)).toEqual(parentBefore);
  const archived=await repository.getCommittedTurns(workspace.id,main.id);expect(archived.map(turn=>turn.id)).toEqual(parentBefore.turns.map(turn=>turn.id));
  expect(archived.find(turn=>turn.id===envelope.summaryCoverage[0])?.answer).toBeTruthy();
  registry.register(workspace.id,'context','oversized',{transform:async envelope=>({...envelope,messages:[{role:'user',content:'坏'.repeat(10000)}],budget:{limit:6000,inputTokens:0,reservedOutputTokens:0}})});
  await expect(context.build(request,new AbortController().signal)).rejects.toMatchObject({code:'CONTEXT_LIMIT'});
 });
});
