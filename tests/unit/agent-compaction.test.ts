import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';import {SessionRepository} from '../../packages/core/src/sessions/repository.js';import {SessionService} from '../../packages/core/src/sessions/service.js';import {DocumentService} from '../../packages/core/src/documents/service.js';import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
import {ContextBuilder} from '../../packages/core/src/sessions/context.js';import {toolLoop} from '../../packages/core/src/runs/tool-loop.js';import {ReaderError} from '../../packages/contracts/src/errors.js';import type {ModelProvider} from '../../packages/sdk/src/capabilities.js';import type {RunId} from '../../packages/contracts/src/ids.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
describe('AI context compaction',()=>{
 it('condenses at pressure before overflow, reuses the persisted checkpoint and preserves raw turns',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reader compaction '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const root=join(directory,'root');await mkdir(root);
  const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());const actor={callerId:'local-owner',transport:'internal' as const};const workspace=await workspaces.select(root,actor),registry=new CapabilityRegistry();
  let summaries=0;
  registry.register(workspace.id,'model','model',{capabilities:{vision:false,tools:false,contextWindow:10000,maxOutputTokens:512},generate:async function*(request){summaries++;expect(request.messages.at(-1)?.content).toContain('检查点');expect(request.usagePurpose).toBe('compaction');yield{kind:'delta',text:'用户目标：理解课程。待办：解释概念。来源：历史轮次。'};yield{kind:'done'};}});
  const repository=new SessionRepository(workspaces),sessions=new SessionService(repository),documents=new DocumentService(workspaces,registry);cleanup.push(()=>documents.close());const context=new ContextBuilder(repository,documents,registry),main=await sessions.createMain(workspace.id,'history');
  const scope={actor,workspaceId:workspace.id,sessionId:main.id,runId:randomUUID() as RunId,allowArtifactWrites:false};const release=await repository.registerScope(scope);cleanup.push(async()=>release());
  for(let n=0;n<9;n++){
   const turnScope={...scope,runId:randomUUID() as RunId},unbind=await repository.registerScope(turnScope);
   await repository.completeOwnTurn(turnScope,{id:'turn-'+n,runId:turnScope.runId,question:'question '+n,answer:'answer',messages:[{role:'user',content:'question '+n+' '+ 'x'.repeat(400)},{role:'assistant',content:'answer '+n+' '+'y'.repeat(400)}],sourceAnchors:[],attachmentIds:[]});unbind();
  }
  const request={workspaceId:workspace.id,sessionId:main.id,question:'continue',documents:[],attachmentIds:[],providerId:'model',requestId:randomUUID(),allowArtifactWrites:false};
  const before=await repository.getCommittedTurns(workspace.id,main.id),first=await context.build(request,new AbortController().signal);
  expect(first.summaryCoverage.length).toBeGreaterThan(0);expect(summaries).toBeGreaterThan(0);expect(JSON.stringify(first.messages)).toContain('question 8');
  expect(first.budget.inputTokens+first.budget.reservedOutputTokens).toBeLessThan(8000);
  await repository.saveOwnSummary(scope,first.memory!);const count=summaries;
  const second=await context.build({...request,requestId:randomUUID()},new AbortController().signal);
  expect(summaries).toBe(count);expect(second.summaryCoverage).toEqual(first.summaryCoverage);expect(await repository.getCommittedTurns(workspace.id,main.id)).toEqual(before);
  expect(second.messages.filter(message=>message.role==='system')).toHaveLength(1);
  const nextScope={...scope,runId:randomUUID() as RunId},unbind=await repository.registerScope(nextScope);
  await repository.completeOwnTurn(nextScope,{id:'new-turn',runId:nextScope.runId,question:'followup',answer:'reply',messages:[{role:'user',content:'followup'},{role:'assistant',content:'reply'}],sourceAnchors:[],attachmentIds:[]});unbind();
  const third=await context.build(request,new AbortController().signal);
  await expect(repository.saveOwnSummary(scope,third.memory!)).resolves.toBeUndefined();expect(summaries).toBe(count);
 });

 it('recovers once from a provider context overflow using an AI summary without repeating tools',async()=>{
  let attempts=0,summaries=0;const emissions:Array<{kind:string;data:any}>=[];
  const model:ModelProvider={capabilities:{vision:false,tools:false,contextWindow:10000,maxOutputTokens:512},generate:async function*(request){
   if(request.usagePurpose==='compaction'){summaries++;yield{kind:'delta',text:'保留目标与证据的检查点。'};yield{kind:'done'};return;}
   if(attempts++===0)throw new ReaderError('CONTEXT_LIMIT','overflow');
   expect(JSON.stringify(request.messages)).toContain('当前问题');yield{kind:'delta',text:'恢复后的回答'};yield{kind:'done'};
  }};
  const envelope:any={workspaceId:'w',sessionId:'s',mainRevision:1,messages:[{role:'system',content:'阅读规则'},{role:'user',content:'旧问题'},{role:'assistant',content:'旧回答'.repeat(100)},{role:'user',content:'当前问题'}],sourceRanges:[],summaryCoverage:[],budget:{limit:10000,inputTokens:1000,reservedOutputTokens:512}};
  const result=await toolLoop(model,envelope,[],{workspaceId:'w',sessionId:'s',runId:'r'} as any,{} as any,async(kind,data)=>{emissions.push({kind,data});},new AbortController().signal);
  expect(result.answer).toBe('恢复后的回答');expect(attempts).toBe(2);expect(summaries).toBe(1);expect(emissions.filter(event=>event.kind==='delta')).toHaveLength(1);
 });
});
