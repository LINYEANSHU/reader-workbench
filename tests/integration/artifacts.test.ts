import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,cp,rm,readFile,writeFile,access,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {startServer} from '../../apps/server/src/app.js';
import {ArtifactService} from '../../packages/core/src/artifacts/service.js';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {ArtifactInput,ContentBlock} from '../../packages/contracts/src/artifacts.js';
import type {RunScope,RunId} from '../../packages/contracts/src/ids.js';
import type {AskRequest} from '../../packages/contracts/src/sessions.js';
const actor={callerId:'local-owner',transport:'internal' as const},signal=()=>new AbortController().signal;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const normalizeExtractedText=(text:string)=>text.replace(/\s+/gu,'');
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'reader artifacts 中文 '));cleanup.push(()=>rm(dir,{recursive:true,force:true}));
 const root=join(dir,'workspace A'),other=join(dir,'workspace B');await mkdir(root);await mkdir(other);await cp('tests/fixtures',root,{recursive:true});
 const local=resolve('.reader-runtime/LibreOffice/program/soffice.com');try{await access(local);process.env.READER_LIBREOFFICE=local;}catch{}
 const server=await startServer({host:'127.0.0.1',port:0,configDir:join(dir,'config'),demo:false,noOpen:true});cleanup.push(()=>server.close());const workspace=await server.workspaces.select(root,actor),main=await server.sessions.createMain(workspace.id,'输出'),temp=await server.sessions.createTemporary(workspace.id,main.id);
 const scope:RunScope={actor,workspaceId:workspace.id,sessionId:temp.id,runId:randomUUID() as RunId,allowArtifactWrites:true};const release=await server.sessionRepository.registerScope(scope);cleanup.push(async()=>release());
 return{dir,root,other,server,workspace,main,temp,scope};
}
describe('workspace artifact export',()=>{
 it('reopens generated files inside the original run workspace',async()=>{
  const {root,other,server,workspace,scope,main}=await setup();expect(server.artifacts).toBeInstanceOf(ArtifactService);
  const source=await server.documents.open(workspace.id,'reader.md',signal());await server.documents.waitReady(source,signal());const original=hash(await readFile(join(root,'reader.md'))),parent=await server.sessionRepository.snapshot(workspace.id,main.id);
  const blocks:ContentBlock[]=[{kind:'heading',level:1,text:'中文输出 RI'},{kind:'paragraph',text:'保留来源、图片、表格和公式。RI means rank indicator.'},{kind:'list',items:['秩指示','信道状态']},{kind:'table',rows:[['参数','含义'],['RI','秩指示']]},{kind:'formula',text:'\\frac{1}{2} + x^2'},{kind:'image',data:new Uint8Array(await readFile('tests/fixtures/assets/diagram.png')),mime:'image/png',alt:'示意图'}];
  await server.workspaces.select(other,actor);
  for(const format of ['md','txt','docx','pptx','pdf'] as const){
   const input:ArtifactInput={format,name:'阅读件',blocks,sourceAnchors:[{workspaceId:workspace.id,documentId:source.documentId,version:source.version,location:{kind:'block',blockId:(await server.documents.parsed(source)).blocks[0]!.id,start:0,end:2}}],coverage:{status:'partial',sourceBlockIds:[],note:'仅选取一段'}};
   const artifact=await server.artifacts.create(input,scope,signal());expect(artifact.workspaceId).toBe(workspace.id);expect(artifact.relativePath.startsWith('outputs/'+scope.sessionId+'/')).toBe(true);expect(artifact.coverage?.status).toBe('partial');expect(hash(await readFile(join(root,artifact.relativePath)))).toBe(artifact.sha256);
   expect(await server.artifacts.create(input,scope,signal())).toEqual(artifact);expect(artifact.warnings.join(' ')).not.toMatch(/公式.*失败|公式无法渲染/);
   const reopened=await server.artifacts.open(workspace.id,artifact.id);expect((await server.documents.waitReady(reopened,signal())).parseState).toBe('ready');const page=await server.documents.readPage(reopened,1);expect(normalizeExtractedText(page.text)).toContain('部分');expect(normalizeExtractedText(page.text)).toContain('RI');
   if(['docx','pptx','pdf'].includes(format)){
    expect(page.imagePath).toBeTruthy();const ready=await server.documents.get(reopened),pages=[];
    for(let number=1;number<=ready.pageCount;number++){const rendered=await server.documents.readPage(reopened,number);pages.push(rendered);if(process.env.READER_RENDER_EVIDENCE==='1'){const output=resolve('.superpowers/sdd/2026-10-11-reader-workbench/artifacts');await mkdir(output,{recursive:true});await writeFile(join(output,format+'-'+number+'.png'),await readFile(rendered.imagePath!));}}
    expect(normalizeExtractedText(pages.map(p=>p.text).join('\n'))).toContain('\\frac{1}{2}+x^2');
    if(format==='pptx'){const picture=pages.find(p=>p.text.includes('示意图'))!;expect(picture).toBeTruthy();const image=await loadImage(await readFile(picture.imagePath!)),canvas=createCanvas(image.width,image.height),context=canvas.getContext('2d');context.drawImage(image,0,0);const pixel=context.getImageData(Math.floor(image.width*.885),Math.floor(image.height*.655),1,1).data;expect([...pixel].slice(0,3)).toEqual([18,63,98]);}
   }
  }
  expect(hash(await readFile(join(root,'reader.md')))).toBe(original);expect(await server.sessionRepository.snapshot(workspace.id,main.id)).toEqual(parent);expect(await readdir(other)).not.toContain('outputs');
 },120000);
 it('publishes unique names, preserves existing files and checks completed content before download',async()=>{
  const {root,server,workspace,scope}=await setup();const input:ArtifactInput={format:'txt',name:'阅读件.txt',blocks:[{kind:'paragraph',text:'first'}],sourceAnchors:[]};
  const first=await server.artifacts.create(input,scope,signal()),second=await server.artifacts.create({...input,blocks:[{kind:'paragraph',text:'second'}]},scope,signal());expect(first.relativePath).not.toBe(second.relativePath);expect(await readFile(join(root,first.relativePath),'utf8')).toContain('first');
  await writeFile(join(root,first.relativePath),'changed');await expect(server.artifacts.download(workspace.id,first.id)).rejects.toMatchObject({code:'ARTIFACT_CHANGED'});
 });
 it('rejects forged scopes, disabled writes, traversal and output links',async()=>{
  const {dir,root,server,workspace,scope,main}=await setup();const input:ArtifactInput={format:'txt',name:'test',blocks:[{kind:'paragraph',text:'hello'}],sourceAnchors:[]};
  await expect(server.artifacts.create(input,{...scope,sessionId:main.id},signal())).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
  await expect(server.artifacts.create(input,{...scope,allowArtifactWrites:false},signal())).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
  await expect(server.artifacts.create({...input,name:'../escape'},scope,signal())).rejects.toMatchObject({code:'INVALID_FILENAME'});
  const outside=join(dir,'outside');await mkdir(outside);await symlink(outside,join(root,'outputs'),process.platform==='win32'?'junction':'dir');await expect(server.artifacts.create(input,scope,signal())).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});expect(await readdir(outside)).toEqual([]);expect(await server.artifacts.list(workspace.id)).toEqual([]);
 });
 it('does not publish cancelled, failed exports or an unproven complete reading',async()=>{
  const {server,workspace,scope}=await setup();const controller=new AbortController();controller.abort();const input:ArtifactInput={format:'pdf',name:'cancel',blocks:[{kind:'paragraph',text:'hello'}],sourceAnchors:[]};await expect(server.artifacts.create(input,scope,controller.signal)).rejects.toThrow();
  const prior=process.env.READER_LIBREOFFICE;try{process.env.READER_LIBREOFFICE='invalid-converter';await expect(server.artifacts.create({...input,name:'failed'},scope,signal())).rejects.toMatchObject({code:'CONVERTER_UNAVAILABLE'});}finally{process.env.READER_LIBREOFFICE=prior;}
  const doc=await server.documents.open(workspace.id,'reader.md',signal());await server.documents.waitReady(doc,signal());await expect(server.artifacts.create({...input,format:'md',name:'false complete',sourceAnchors:[(await server.documents.parsed(doc)).blocks[0]!.anchor],coverage:{status:'complete',sourceBlockIds:[]}},scope,signal())).rejects.toMatchObject({code:'COVERAGE_INCOMPLETE'});expect(await server.artifacts.list(workspace.id)).toEqual([]);
 });
 it('saves binary files and routes authentic session-scoped exports with downloadable bytes',async()=>{
  const {server,workspace,temp,scope}=await setup();const binary=await server.artifacts.create({format:'binary',name:'opaque.bin',blocks:[],sourceAnchors:[],bytes:new Uint8Array([0,1,255]),mime:'application/octet-stream'},scope,signal());expect((await server.documents.waitReady(await server.artifacts.open(workspace.id,binary.id),signal())).viewer.kind).toBe('fallback');
  const headers={authorization:'Bearer '+server.auth.token,'content-type':'application/json'};const made=await fetch(server.url+'/api/v1/artifacts',{method:'POST',headers,body:JSON.stringify({workspaceId:workspace.id,sessionId:temp.id,input:{format:'txt',name:'API',blocks:[{kind:'paragraph',text:'真实输出'}],sourceAnchors:[]}})});expect(made.status).toBe(201);const record=await made.json() as {id:string};
  const downloaded=await fetch(server.url+'/api/v1/artifacts/'+record.id+'/download?workspaceId='+workspace.id,{headers});expect(await downloaded.text()).toContain('真实输出');expect(downloaded.headers.get('content-disposition')).toContain('attachment');
 });
 it('aborts an in-flight exporter before closing its workspace database',async()=>{
  const {server,workspace,scope}=await setup();let entered!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve);let aborted=false;
  server.capabilities.register(workspace.id,'exporter','slow',{formats:['txt'],export:async(_input,_scope,signal)=>{entered();await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));return{bytes:Buffer.from('late'),mime:'text/plain',extension:'.txt'};}});
  const result=server.artifacts.create({format:'txt',name:'cancel',blocks:[],sourceAnchors:[]},scope,signal()).catch(error=>error);await ready;await server.artifacts.close();expect(aborted).toBe(true);expect(await result).toBeInstanceOf(Error);expect(await server.artifacts.list(workspace.id)).toEqual([]);
 });
 it('emits an artifact only after a real agent tool commits its file and never commits failed exports',async()=>{
  const {server,workspace,temp,main}=await setup();const parent=await server.sessionRepository.snapshot(workspace.id,main.id);let format='md';
  server.capabilities.register(workspace.id,'model','artifact-model',{capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:256},async *generate(request){if(request.messages.at(-1)?.role!=='tool')yield{kind:'tool-call',id:'save',name:'save_artifact',input:{format,name:'agent result',blocks:[{kind:'paragraph',text:'真实文件 RI'}],sourceAnchors:[]}};else yield{kind:'delta',text:'已保存'};yield{kind:'done'};}});
  const ask=():AskRequest=>({workspaceId:workspace.id,sessionId:temp.id,providerId:'artifact-model',question:'生成阅读件',documents:[],attachmentIds:[],requestId:randomUUID(),allowArtifactWrites:true});const request=ask(),submitted=await server.runs.submit(request,actor),events=[];
  for await(const event of server.runs.events(workspace.id,submitted.runId,0,signal()))events.push(event);const emitted=events.find(event=>event.kind==='artifact')?.data as {id:never};expect(emitted?.id).toBeTruthy();expect(await server.artifacts.download(workspace.id,emitted.id)).toBeTruthy();expect((await server.runs.get(workspace.id,submitted.runId)).status).toBe('completed');expect(await server.runs.submit(request,actor)).toEqual(submitted);expect(await server.artifacts.list(workspace.id,temp.id)).toHaveLength(1);
  format='pdf';const previous=process.env.READER_LIBREOFFICE;try{process.env.READER_LIBREOFFICE='invalid-converter';const failed=await server.runs.submit(ask(),actor),failedEvents=[];for await(const event of server.runs.events(workspace.id,failed.runId,0,signal()))failedEvents.push(event);expect((await server.runs.get(workspace.id,failed.runId)).status).toBe('failed');expect(failedEvents.some(event=>event.kind==='artifact')).toBe(false);}finally{process.env.READER_LIBREOFFICE=previous;}
  expect((await server.sessionRepository.snapshot(workspace.id,temp.id)).turns).toHaveLength(1);expect(await server.sessionRepository.snapshot(workspace.id,main.id)).toEqual(parent);
 });
 it('freezes a configured relative output directory when the run is submitted',async()=>{
  const {root,server,workspace,temp}=await setup();await server.artifacts.setOutputDirectory(workspace.id,'读件/初始');let entered!:()=>void,finish!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>finish=resolve);
  server.capabilities.register(workspace.id,'model','output-freeze',{capabilities:{vision:false,tools:true,contextWindow:32000,maxOutputTokens:256},async *generate(request){if(request.messages.at(-1)?.role!=='tool'){entered();await gate;yield{kind:'tool-call',id:'save',name:'save_artifact',input:{format:'txt',name:'frozen',blocks:[{kind:'paragraph',text:'保留原输出归属'}],sourceAnchors:[]}};}else yield{kind:'delta',text:'完成'};yield{kind:'done'};}});
  const result=await server.runs.submit({workspaceId:workspace.id,sessionId:temp.id,question:'保存',providerId:'output-freeze',documents:[],attachmentIds:[],requestId:randomUUID(),allowArtifactWrites:true},actor);await started;await server.artifacts.setOutputDirectory(workspace.id,'读件/之后');finish();for await(const _ of server.runs.events(workspace.id,result.runId,0,signal())){}const output=(await server.artifacts.list(workspace.id,temp.id))[0]!;expect(output.relativePath.startsWith('读件/初始/'+temp.id+'/')).toBe(true);expect(await readFile(join(root,output.relativePath),'utf8')).toContain('保留原输出归属');await expect(server.artifacts.setOutputDirectory(workspace.id,'../outside')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
 });
});
