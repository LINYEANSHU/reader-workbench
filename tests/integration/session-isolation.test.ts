import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {SessionRepository} from '../../packages/core/src/sessions/repository.js';
import {SessionService} from '../../packages/core/src/sessions/service.js';
import {ContextBuilder} from '../../packages/core/src/sessions/context.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
import type {AskRequest,SessionRecord,CompletedTurn} from '../../packages/contracts/src/sessions.js';
import type {RunScope,RunId} from '../../packages/contracts/src/ids.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
const actor={callerId:'local-owner',transport:'internal' as const};
async function setup(){
 const directory=await mkdtemp(join(tmpdir(),'reader memory '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const root=join(directory,'A');await mkdir(root);
 const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());
 const workspace=await workspaces.select(root,actor);const registry=new CapabilityRegistry();
 registry.register(workspace.id,'model','test',{capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:1000},generate:async function*(){yield {kind:'done'};}});
 const documents=new DocumentService(workspaces,registry);cleanup.push(()=>documents.close());
 const repository=new SessionRepository(workspaces),sessions=new SessionService(repository),context=new ContextBuilder(repository,documents,registry);
 const main=await sessions.createMain(workspace.id,'阅读主对话');const temporary=await sessions.createTemporary(workspace.id,main.id);
 return{directory,workspaces,workspace,registry,documents,repository,sessions,context,main,temporary};
}
function ask(session:SessionRecord,question:string):AskRequest{return{workspaceId:session.workspaceId,sessionId:session.id,question,documents:[],attachmentIds:[],providerId:'test',requestId:randomUUID(),allowArtifactWrites:session.kind==='main'};}
async function commit(repository:SessionRepository,session:SessionRecord,question:string,answer:string){
 const scope:RunScope={actor,workspaceId:session.workspaceId,sessionId:session.id,runId:randomUUID() as RunId,allowArtifactWrites:session.kind==='main'};
 const release=await repository.registerScope(scope);
 const turn:CompletedTurn={id:randomUUID(),runId:scope.runId,question,answer,messages:[{role:'user',content:question},{role:'assistant',content:answer}],sourceAnchors:[],attachmentIds:[]};
 try{await repository.completeOwnTurn(scope,turn);}finally{release();}return{scope,turn};
}
describe('temporary memory isolation',()=>{
 it('inherits the next committed revision without writing to parent',async()=>{
  const {repository,sessions,context,main,temporary}=await setup();const firstTurn=await commit(repository,main,'A-question','A-answer');
  const mainRelease=await repository.registerScope(firstTurn.scope);
  await repository.saveOwnSummary(firstTurn.scope,{text:'主摘要：A 的事实',turnIds:[firstTurn.turn.id],revision:1});
  await repository.saveOwnToolState(firstTurn.scope,{lastTool:'read_page',completed:true});mainRelease();
  const parentBefore=await sessions.getHistory(main.workspaceId,main.id);
  const parentSnapshot=await repository.snapshot(main.workspaceId,main.id);
  const first=await context.build(ask(temporary,'T1-question'),new AbortController().signal);expect(first.mainRevision).toBe(1);
  const temporaryTurn=await commit(repository,temporary,'T1-question','T1-answer');
  const ownRelease=await repository.registerScope(temporaryTurn.scope);
  await repository.saveOwnSummary(temporaryTurn.scope,{text:'临时摘要覆盖 A 和 T1',turnIds:[temporaryTurn.turn.id],revision:1,parentTurnIds:[firstTurn.turn.id],parentRevision:1});
  await expect(repository.saveOwnSummary(temporaryTurn.scope,{text:'非法覆盖',turnIds:[],revision:1,parentTurnIds:['foreign-turn'],parentRevision:1})).rejects.toMatchObject({code:'SUMMARY_SCOPE_DENIED'});
  ownRelease();
  expect((await repository.snapshot(main.workspaceId,temporary.id)).summary?.parentTurnIds).toEqual([firstTurn.turn.id]);
  expect(await sessions.getHistory(main.workspaceId,main.id)).toEqual(parentBefore);
  expect(await repository.snapshot(main.workspaceId,main.id)).toEqual(parentSnapshot);
  await commit(repository,main,'B-question','B-answer');
  const next=await context.build(ask(temporary,'T2-question'),new AbortController().signal);expect(next.mainRevision).toBe(2);
  const text=next.messages.map(message=>message.content).join('\n');
  for(const expected of ['B-question','B-answer','临时摘要覆盖 A 和 T1'])expect(text.split(expected)).toHaveLength(2);
  expect(next.summaryCoverage).toEqual([firstTurn.turn.id,temporaryTurn.turn.id]);
  expect((await repository.getCommittedTurns(main.workspaceId,main.id)).find(turn=>turn.id===firstTurn.turn.id)?.answer).toBe('A-answer');
  expect((await repository.getCommittedTurns(main.workspaceId,temporary.id)).find(turn=>turn.id===temporaryTurn.turn.id)?.answer).toBe('T1-answer');
  expect(first.mainRevision).toBe(1);expect(first.messages.map(message=>message.content).join('\n')).not.toContain('B-answer');
  expect(Object.isFrozen(first.messages)).toBe(true);
  const partialScope:RunScope={actor,workspaceId:main.workspaceId,sessionId:main.id,runId:randomUUID() as RunId,allowArtifactWrites:true};
  const release=await repository.registerScope(partialScope);
  const during=await context.build(ask(temporary,'during-main-stream'),new AbortController().signal);expect(during.mainRevision).toBe(2);release();
 });
 it('rejects forged write scopes, cross-workspace parents and temporary parents',async()=>{
  const {workspaces,directory,repository,sessions,main,temporary}=await setup();
  const {scope,turn}=await commit(repository,temporary,'own','own reply');
  const release=await repository.registerScope(scope);
  await expect(repository.completeOwnTurn({...scope,sessionId:main.id},turn)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
  await expect(repository.saveOwnSummary({...scope,sessionId:main.id},{text:'injected',turnIds:[turn.id],revision:1})).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});release();
  const toolRelease=await repository.registerScope(scope);
  await expect(repository.saveOwnToolState({...scope,sessionId:main.id},{overwrite:true})).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});toolRelease();
  await expect(sessions.createTemporary(main.workspaceId,temporary.id)).rejects.toMatchObject({code:'INVALID_PARENT_SESSION'});
  const otherRoot=join(directory,'B');await mkdir(otherRoot);const other=await workspaces.select(otherRoot,actor);
  await expect(sessions.createTemporary(other.id,main.id)).rejects.toMatchObject({code:'SESSION_UNAVAILABLE'});
 });
 it('clears one branch and restores independent history after reopening storage',async()=>{
  const {workspaces,repository,sessions,main,temporary}=await setup();const other=await sessions.createTemporary(main.workspaceId,main.id);
  await commit(repository,main,'retained main','main answer');await commit(repository,temporary,'clear this','own answer');await commit(repository,other,'keep branch','other answer');
  await sessions.clearTemporary(main.workspaceId,temporary.id,actor);
  expect((await sessions.getHistory(main.workspaceId,temporary.id)).turns).toEqual([]);
  expect((await sessions.getHistory(main.workspaceId,other.id)).turns).toHaveLength(1);
  expect((await sessions.getHistory(main.workspaceId,main.id)).turns).toHaveLength(1);
  await workspaces.close();
  const reopened=new WorkspaceService(workspaces.configDir);cleanup.push(()=>reopened.close());const restored=new SessionService(new SessionRepository(reopened));
  expect((await restored.getHistory(main.workspaceId,main.id)).turns[0]?.answer).toBe('main answer');
 });
});
export {setup,ask,commit};
