import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {SessionRepository} from '../../packages/core/src/sessions/repository.js';
import {SessionService} from '../../packages/core/src/sessions/service.js';
import {RunRepository} from '../../packages/core/src/runs/repository.js';
import {builtinTools} from '../../packages/core/src/tools/builtins.js';
import type {RunId,RunScope} from '../../packages/contracts/src/ids.js';
import type {RunRecord} from '../../packages/contracts/src/runs.js';

const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function setup(pageCount=3,selectedPage=2){
 const directory=await mkdtemp(join(tmpdir(),'reading-source-scope-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const root=join(directory,'workspace');await mkdir(root);
 const pdf=await PDFDocument.create();for(let page=1;page<=pageCount;page++)pdf.addPage([200,200]).drawText('shared marker page '+page,{x:12,y:170,size:10});await writeFile(join(root,'source.pdf'),await pdf.save());
 const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());const actor={callerId:'local-owner',transport:'internal' as const},workspace=await workspaces.select(root,actor);
 const documents=new DocumentService(workspaces);cleanup.push(()=>documents.close());const document=await documents.open(workspace.id,'source.pdf',new AbortController().signal);await documents.waitReady(document,new AbortController().signal);
 const repository=new SessionRepository(workspaces),sessions=new SessionService(repository),session=await sessions.createMain(workspace.id,'scope');
 const ref={workspaceId:document.workspaceId,documentId:document.documentId,version:document.version},runId='scoped-run' as RunId;
 const record:RunRecord={id:runId,kind:'agent',workspaceId:workspace.id,sessionId:session.id,status:'running',requestId:'scope',request:{workspaceId:workspace.id,sessionId:session.id,providerId:'test',requestId:'scope',question:'shared',documents:[ref],attachmentIds:[],allowArtifactWrites:false},callerId:actor.callerId,createdAt:new Date().toISOString(),partialText:'',context:{workspaceId:workspace.id,sessionId:session.id,mainRevision:0,ownRevision:0,documents:[ref],documentMemories:[{document:ref,pluginId:'test',cacheKey:'test',generation:0,pageCount:3,completedPages:[2],status:'partial'}],messages:[],sourceRanges:[],budget:{limit:100000,inputTokens:0,reservedOutputTokens:0,estimated:true},summaryCoverage:[]}};
 const runs=new RunRepository(workspaces);await runs.createOrGet(record);
 const scope:RunScope={actor,workspaceId:workspace.id,sessionId:session.id,runId,allowArtifactWrites:false};
 return{scope,ref,record,runs,documents,root,tools:builtinTools(documents,repository,runs).tools};
}

it('source tools refuse excluded pages and blocks from a range-scoped run',async()=>{
 const {tools,scope,ref}=await setup(),page=tools.find(tool=>tool.name==='read_document_page')!,block=tools.find(tool=>tool.name==='read_document_block')!,signal=new AbortController().signal;
 await expect(page.execute({...ref,page:3},scope,signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
 await expect(block.execute({...ref,blockId:'page-1'},scope,signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
 expect((await page.execute({...ref,page:2},scope,signal)).content).toContain('page 2');
});

it('source search returns only hits from the run reading range',async()=>{
 const {tools,scope,ref}=await setup(),tool=tools.find(tool=>tool.name==='search_document')!;
 const result=await tool.execute({...ref,query:'shared'},scope,new AbortController().signal);
 expect(JSON.parse(result.content).map((hit:{text:string})=>hit.text)).toEqual(['shared marker page 2']);
 expect(result.sourceAnchors?.map(anchor=>anchor.location.kind==='page'?anchor.location.page:0)).toEqual([2]);
});

it('refuses a known document version absent from this run before source access',async()=>{
 const {scope,ref,tools,documents,root}=await setup(),other=await PDFDocument.create();other.addPage([200,200]).drawText('outside this run',{size:10});await writeFile(join(root,'other.pdf'),await other.save());
 const foreign=await documents.open(scope.workspaceId,'other.pdf',new AbortController().signal);await documents.waitReady(foreign,new AbortController().signal);
 for(const [name,args]of [['read_document_page',{page:1}],['read_document_block',{blockId:'page-1'}],['search_document',{query:'outside'}]] as const){const tool=tools.find(tool=>tool.name===name)!;await expect(tool.execute({...ref,documentId:foreign.documentId,version:foreign.version,...args},scope,new AbortController().signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});}
});

it('selection-only asks cannot expand into ordinary page, block, or search reads',async()=>{
 const {scope,ref,record,runs,tools}=await setup();record.request.selection={text:'shared',anchors:[{...ref,location:{kind:'page',page:2}}]};record.context!.documentMemories=[];record.context!.documentReadScopes=[];await runs.save(record);
 for(const [name,args]of [['read_document_page',{page:2}],['read_document_block',{blockId:'page-2'}],['search_document',{query:'shared'}]] as const){const tool=tools.find(tool=>tool.name===name)!;await expect(tool.execute({...ref,...args},scope,new AbortController().signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});}
});

it('enforces a pinned reading range even when document memory is disabled',async()=>{
 const {scope,ref,record,runs,tools}=await setup();record.context!.documentMemories=[];record.context!.documentReadScopes=[{document:ref,pages:[2]}];await runs.save(record);
 const page=tools.find(tool=>tool.name==='read_document_page')!;await expect(page.execute({...ref,page:1},scope,new AbortController().signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});expect((await page.execute({...ref,page:2},scope,new AbortController().signal)).content).toContain('page 2');
});

it('searches selected pages beyond the first hundred global matches',async()=>{
 const {scope,ref,record,runs,tools}=await setup(130);record.context!.documentMemories=[];record.context!.documentReadScopes=[{document:ref,pages:[129]}];await runs.save(record);
 const result=await tools.find(tool=>tool.name==='search_document')!.execute({...ref,query:'shared'},scope,new AbortController().signal);
 expect(JSON.parse(result.content).map((hit:{text:string})=>hit.text)).toEqual(['shared marker page 129']);
});
