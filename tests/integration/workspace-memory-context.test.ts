import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {startServer} from '../../apps/server/src/app.js';
import {WorkspaceMemoryService} from '../../packages/core/src/knowledge/service.js';
import type {WorkspaceMemoryItem} from '../../packages/contracts/src/workspace-memory.js';
import type {ModelRequest} from '../../packages/contracts/src/models.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
it('automatically supplies other-file evidence with source grants while keeping selection-only questions restricted',async()=>{
 const root=await mkdtemp(join(tmpdir(),'reader context memory '));cleanup.push(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'workspace');await mkdir(directory);
 await writeFile(join(directory,'question.md'),'Explain capacitor impedance.');await writeFile(join(directory,'reference.md'),'REFERENCE_EVIDENCE: Capacitor impedance is 1/(j omega C).');
 const host=await startServer({host:'127.0.0.1',port:0,configDir:join(root,'config'),demo:true,noOpen:true});cleanup.push(()=>host.close());
 const actor={callerId:'local-owner',transport:'internal' as const},workspace=await host.workspaces.select(directory,actor),main=await host.sessions.createMain(workspace.id,'Workspace question'),document=await host.documents.open(workspace.id,'question.md',new AbortController().signal);
 await host.documents.waitReady(document,new AbortController().signal);await host.plugins.disable('visual-document-memory',workspace.id);
 let items:WorkspaceMemoryItem[]=[];
 const memory=new WorkspaceMemoryService(host.workspaces,host.documents,{available:async()=>true,replace:async(_id,values)=>{items=values;},search:async()=>items.map(item=>item.id),close:async()=>{}});cleanup.push(()=>memory.close());
 await memory.sync(workspace.id,new AbortController().signal);host.context.attachWorkspaceMemory(memory);
 const requests:ModelRequest[]=[];host.capabilities.register(workspace.id,'model','knowledge-test',{capabilities:{vision:false,tools:false,contextWindow:100000},async *generate(input){requests.push(structuredClone(input));yield{kind:'delta',text:'回答'};yield{kind:'done'};}});
 const ask=async(selection?:import('../../packages/contracts/src/documents.js').SelectionContext)=>{
  const run=await host.runs.submit({workspaceId:workspace.id,sessionId:main.id,documents:[document],providerId:'knowledge-test',question:'解释这个概念',requestId:randomUUID(),attachmentIds:[],allowArtifactWrites:false,...(selection?{selection}:{})},actor);
  for await(const _event of host.runs.events(workspace.id,run.runId,0,new AbortController().signal)){}return host.runs.get(workspace.id,run.runId);
 };
 const first=await ask();expect(first.status).toBe('completed');expect(JSON.stringify(requests.at(-1))).toContain('REFERENCE_EVIDENCE');
 if(first.kind!=='agent')throw Error('expected agent run');expect(first.context?.documents).toHaveLength(2);expect(first.context?.sourceRanges.some(anchor=>anchor.documentId!==document.documentId)).toBe(true);
 const block=(await host.documents.parsed(document)).blocks[0];const second=await ask({text:block.text,anchors:[block.anchor]});
 if(second.kind!=='agent')throw Error('expected agent run');expect(second.context?.documents).toHaveLength(1);expect(second.context?.sourceRanges.every(anchor=>anchor.documentId===document.documentId)).toBe(true);
 expect(JSON.stringify(requests.at(-1)?.messages.filter(message=>typeof message.content==='string'&&message.content.startsWith('工作区关联资料')))).not.toContain('REFERENCE_EVIDENCE');
});
it('exposes authenticated unavailable status and rejects invalid settings without changing the existing reader',async()=>{
 const root=await mkdtemp(join(tmpdir(),'reader knowledge api '));cleanup.push(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'workspace');await mkdir(directory);
 const host=await startServer({host:'127.0.0.1',port:0,configDir:join(root,'config'),demo:true,noOpen:true});cleanup.push(()=>host.close());const workspace=await host.workspaces.select(directory,{callerId:'local-owner',transport:'internal'});
 const url='/api/v1/workspaces/'+workspace.id+'/memory',headers={host:new URL(host.url).host,authorization:'Bearer '+host.auth.token};
 expect((await host.app.inject({url,headers:{host:headers.host}})).statusCode).toBe(401);
 const status=await host.app.inject({url,headers});expect(status.statusCode).toBe(200);expect(status.json()).toMatchObject({state:'unavailable',available:false});
 expect((await host.app.inject({url,method:'PUT',headers,payload:{enabled:'yes'}})).statusCode).toBe(400);
 expect((await host.app.inject({url,method:'PUT',headers,payload:{enabled:false}})).json()).toMatchObject({state:'disabled'});
});
