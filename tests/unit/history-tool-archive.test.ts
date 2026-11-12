import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {ContextBuilder} from '../../packages/core/src/sessions/context.js';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {SessionRepository} from '../../packages/core/src/sessions/repository.js';
import {SessionService} from '../../packages/core/src/sessions/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
import {historyTurn} from '../../packages/core/src/sessions/memory.js';
import type {RunId} from '../../packages/contracts/src/ids.js';
import type {ModelMessage} from '../../packages/contracts/src/models.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
const exchange=(index:number):ModelMessage[]=>[{role:'user',content:'问题 '+index},{role:'assistant',content:'',reasoning_content:'思考 '+index,tool_calls:[{id:'call-'+index,type:'function',function:{name:'read_document_page',arguments:'{}'}}]},{role:'tool',tool_call_id:'call-'+index,content:'TOOL-'+index+' '+'页'.repeat(1000)},{role:'assistant',content:'回答 '+index}];
it('keeps small tool results and the call pairing when archiving older turns',()=>{
 const turn={messages:[...exchange(1),{role:'tool' as const,tool_call_id:'x',content:'短结果'}]},archived=historyTurn(turn,false);
 expect(archived.messages.map(message=>message.role)).toEqual(turn.messages.map(message=>message.role));
 expect(archived.messages[2]?.content).toContain('原 1007 字');expect(archived.messages[4]?.content).toBe('短结果');expect(archived.messages[1]).not.toHaveProperty('reasoning_content');
 expect(historyTurn({messages:[{role:'user' as const,content:'q'}]},false).messages[0]).toEqual({role:'user',content:'q'});
});
it('resends tool output of the latest two turns only and never resends reasoning',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tool-archive-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const root=join(directory,'A');await mkdir(root);
 const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());const actor={callerId:'local-owner',transport:'internal' as const};const workspace=await workspaces.select(root,actor);
 const registry=new CapabilityRegistry();registry.register(workspace.id,'model','large',{capabilities:{vision:false,tools:false,contextWindow:1_000_000},generate:async function*(){yield{kind:'done'};}});
 const repository=new SessionRepository(workspaces),sessions=new SessionService(repository),documents=new DocumentService(workspaces,registry);cleanup.push(()=>documents.close());const context=new ContextBuilder(repository,documents,registry);
 const main=await sessions.createMain(workspace.id,'tools');
 for(let index=1;index<=4;index++){const scope={actor,workspaceId:workspace.id,sessionId:main.id,runId:randomUUID() as RunId,allowArtifactWrites:true},release=await repository.registerScope(scope);await repository.completeOwnTurn(scope,{id:randomUUID(),runId:scope.runId,question:'问题 '+index,answer:'回答 '+index,messages:exchange(index),sourceAnchors:[],attachmentIds:[]});release();}
 const envelope=await context.build({workspaceId:workspace.id,sessionId:main.id,question:'继续',documents:[],attachmentIds:[],providerId:'large',requestId:'r',allowArtifactWrites:false},new AbortController().signal);
 const sent=JSON.stringify(envelope.messages);
 for(const index of [1,2])expect(sent).not.toContain('TOOL-'+index);
 for(const index of [3,4])expect(sent).toContain('TOOL-'+index);
 for(const index of [1,2,3,4])expect(sent).toContain('回答 '+index);
 expect(sent).not.toContain('思考');expect(envelope.messages.filter(message=>message.role==='tool')).toHaveLength(4);
 expect(JSON.stringify(await repository.getCommittedTurns(workspace.id,main.id))).toContain('TOOL-1');
});
