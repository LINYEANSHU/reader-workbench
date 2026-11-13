import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {ContextBuilder} from '../../packages/core/src/sessions/context.js';
import {ModelMemoryProvider} from '../../packages/core/src/sessions/memory.js';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {SessionRepository} from '../../packages/core/src/sessions/repository.js';
import {SessionService} from '../../packages/core/src/sessions/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
import {clipMiddle} from '../../packages/core/src/models/tokens.js';
import type {RunId} from '../../packages/contracts/src/ids.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
const contextPath='../../plugins/visual-document-memory/context.mjs';
function memory(pages:number,overviewBytes:number){const page=(number:number)=>({page:number,summary:'第'+number+'页','transcription':'文'.repeat(200),figures:[],formulas:[],terms:[],uncertainties:[],crossPageRelations:[]});
 return{document:{workspaceId:'w',documentId:'d',version:'v'},pageCount:pages,completedPages:Array.from({length:pages},(_,index)=>index+1),overview:'概'.repeat(Math.floor(overviewBytes/3)),pages:Array.from({length:pages},(_,index)=>page(index+1))};}
it('shortens the overview and then sends only a pointer instead of failing when memory exceeds its share',async()=>{
 const {select}=await import(contextPath),record=memory(500,60_000);
 const shared=select(record,'第3页讲什么',12_000);expect(Buffer.byteLength(shared.text)).toBeLessThanOrEqual(12_000);expect(shared.text).toContain('概览已截断');expect(shared.text).toContain('1-500');
 const pointer=select(record,'?',600);expect(pointer.pages).toEqual([]);expect(pointer.text).toContain('search_document_memory');expect(Buffer.byteLength(pointer.text)).toBeLessThanOrEqual(600);
 expect(select(record,'?',50)).toEqual({text:'',pages:[]});
});
it('cuts a checkpoint the model keeps writing too long instead of failing',async()=>{
 const provider=new ModelMemoryProvider(()=>({capabilities:{vision:false,tools:false,contextWindow:100_000},generate:async function*(){yield{kind:'delta',text:'长'.repeat(5000)};yield{kind:'done'};}}) as never);
 const text=await provider.summarizeMessages([{role:'user',content:'数据'}],300,new AbortController().signal);
 expect(Buffer.byteLength(text)).toBeLessThanOrEqual(300);expect(text).toContain('检查点超过预算，已截断');
});
it('keeps the beginning and end of a long text within its limit',()=>{
 const text='头'.repeat(1000)+'中'.repeat(5000)+'尾'.repeat(1000),clipped=clipMiddle(text,3000,'…');
 expect(Buffer.byteLength(clipped)).toBeLessThanOrEqual(3000);expect(clipped.startsWith('头')).toBe(true);expect(clipped.endsWith('尾')).toBe(true);expect(clipped).not.toContain('中');expect(clipMiddle('短',10,'…')).toBe('短');
});
it('still answers when history cannot be summarized, sending recent turns and pointing to the archive',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'graceful-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const root=join(directory,'A');await mkdir(root);
 const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());const actor={callerId:'local-owner',transport:'internal' as const},workspace=await workspaces.select(root,actor),registry=new CapabilityRegistry();
 registry.register(workspace.id,'model','small',{capabilities:{vision:false,tools:false,contextWindow:12_000},generate:async function*(){yield{kind:'done'};}});
 registry.register(workspace.id,'memory','broken',{summarize:async()=>{throw new Error('summary service down');}});
 const repository=new SessionRepository(workspaces),sessions=new SessionService(repository),documents=new DocumentService(workspaces,registry);cleanup.push(()=>documents.close());
 const context=new ContextBuilder(repository,documents,registry),main=await sessions.createMain(workspace.id,'long');
 for(let index=0;index<12;index++){const scope={actor,workspaceId:workspace.id,sessionId:main.id,runId:randomUUID() as RunId,allowArtifactWrites:true},release=await repository.registerScope(scope);
  await repository.completeOwnTurn(scope,{id:'turn-'+index,runId:scope.runId,question:'问题'+index,answer:'回答'+index,messages:[{role:'user',content:'问题'+index+' '+'问'.repeat(150)},{role:'assistant',content:'回答'+index+' '+'答'.repeat(150)}],sourceAnchors:[],attachmentIds:[]});release();}
 const envelope=await context.build({workspaceId:workspace.id,sessionId:main.id,question:'继续',documents:[],attachmentIds:[],providerId:'small',requestId:'r',allowArtifactWrites:false},new AbortController().signal);
 const sent=JSON.stringify(envelope.messages);
 expect(sent).toContain('本次未能压缩为摘要');expect(sent).toContain('search_history');expect(sent).toContain('回答11');expect(sent).not.toContain('回答0 ');
 expect(envelope.memory).toBeUndefined();expect(envelope.budget.inputTokens).toBeLessThanOrEqual(12_000);
});
