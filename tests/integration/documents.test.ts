import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,cp,rm,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {runProcess} from '../../packages/core/src/runtime/process.js';
import {findLibreOffice} from '../../packages/core/src/runtime/doctor.js';
import {extractNotes} from '../../packages/core/src/documents/notes.js';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {startServer} from '../../apps/server/src/app.js';
const cleanup:Array<()=>Promise<unknown>>=[];const signal=()=>new AbortController().signal;
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function setup(){
 const directory=await mkdtemp(join(tmpdir(),'reader documents 中文 '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const root=join(directory,'reading');await mkdir(root);await cp(resolve('tests/fixtures'),root,{recursive:true});
 const workspaces=new WorkspaceService(join(directory,'configuration'));cleanup.push(()=>workspaces.close());
 const workspace=await workspaces.select(root,{callerId:'local-owner',transport:'internal'});const documents=new DocumentService(workspaces);cleanup.push(()=>documents.close());
 return{root,workspace,documents};
}
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
describe('versioned document parsing',()=>{
 it('reads office pages and keeps versioned originals',async()=>{
  const local=resolve('.reader-runtime/LibreOffice/program/soffice.com');try{await access(local);process.env.READER_LIBREOFFICE=local;}catch{}
  expect(await findLibreOffice(),'Real LibreOffice required for Office acceptance').toBeTruthy();
  const {root,workspace,documents}=await setup();
  for(const name of ['reader.docx','reader.pptx','reader.doc','reader.ppt']){
   const before=digest(await readFile(join(root,name)));
   if(name.endsWith('.doc')||name.endsWith('.ppt'))expect((await readFile(join(root,name))).subarray(0,8)).toEqual(Buffer.from([208,207,17,224,161,177,26,225]));
   const opened=await documents.open(workspace.id,name,signal());expect(opened.processingRunId).toBeTruthy();
   expect((await documents.waitReady(opened,signal())).pageCount).toBeGreaterThan(0);
   const page=await documents.readPage(opened,1);expect(page.text).toContain('RI');expect(page.imagePath).toBeTruthy();
   if(process.env.READER_RENDER_EVIDENCE==='1'){
     const evidence=resolve('.superpowers/sdd/2026-10-11-reader-workbench/documents');await mkdir(evidence,{recursive:true});
     await writeFile(join(evidence,name+'.png'),await readFile(page.imagePath!));
   }
   expect(digest(await readFile(join(root,name)))).toBe(before);
  }
 },120000);
 it('keeps older references readable and searches Chinese short terms and RI safely',async()=>{
  const {root,workspace,documents}=await setup();
  const old=await documents.open(workspace.id,'reader.md',signal());await documents.waitReady(old,signal());
  expect((await documents.search(old,'秩',20)).length).toBeGreaterThan(0);
  expect((await documents.search(old,'RI',20)).length).toBeGreaterThan(0);
  expect(await documents.search(old,'"); DROP TABLE documents; --',20)).toEqual([]);
  await writeFile(join(root,'reader.md'),'# Updated document\nNo previous marker.');
  const updated=await documents.open(workspace.id,'reader.md',signal());await documents.waitReady(updated,signal());
  expect(updated.version).not.toBe(old.version);
  expect((await documents.readPage(old,1)).text).toContain('RI');
  expect((await documents.readPage(updated,1)).text).not.toContain('RI');
 });
 it('renders PDF pages and scanned pages without claiming OCR text',async()=>{
  const {workspace,documents}=await setup();
  const pdf=await documents.open(workspace.id,'reader.pdf',signal());expect((await documents.waitReady(pdf,signal())).pageCount).toBe(2);
  const page=await documents.readPage(pdf,1);expect(page.text).toContain('RI');expect(page.imagePath).toBeTruthy();
  expect((await readFile(page.imagePath!)).subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  const scanned=await documents.open(workspace.id,'scan.pdf',signal());const ready=await documents.waitReady(scanned,signal());
  expect(ready.warnings.join(' ')).toMatch(/扫描|无文本|OCR/);
  expect((await documents.readPage(scanned,1)).text).toBe('');expect((await documents.readPage(scanned,1)).imagePath).toBeTruthy();
 });
 it('reports invalid PDF and reads text, image and unsupported binary honestly',async()=>{
  const {workspace,documents}=await setup();
  const bad=await documents.open(workspace.id,'broken.pdf',signal());await expect(documents.waitReady(bad,signal())).rejects.toMatchObject({code:'DOCUMENT_PARSE_FAILED'});
  const encrypted=await documents.open(workspace.id,'encrypted.pdf',signal());await expect(documents.waitReady(encrypted,signal())).rejects.toMatchObject({code:'PDF_PASSWORD_REQUIRED'});
  for(const [path,viewer]of [['plain.txt','text'],['assets/diagram.png','image'],['unknown.bin','fallback']]){
   const record=await documents.open(workspace.id,path,signal());expect((await documents.waitReady(record,signal())).viewer.kind).toBe(viewer);
  }
 });
 it('maps notes using presentation order and relationships rather than note filenames',async()=>{
  const {root}=await setup();const zip=unzipSync(new Uint8Array(await readFile(join(root,'reader.pptx'))));
  const xml=strFromU8(zip['ppt/presentation.xml']!);
  const slides=xml.match(/<p:sldId\b[^>]*\/>/g)!;expect(slides).toHaveLength(2);
  zip['ppt/presentation.xml']=strToU8(xml.replace(slides.join(''),[...slides].reverse().join('')));
  const reordered=join(root,'reordered.pptx');await writeFile(reordered,zipSync(zip));
  const notes=await extractNotes(reordered);
  expect(notes.find(note=>note.page===1)?.text).toContain('RI_NOTE_2');
  expect(notes.find(note=>note.page===2)?.text).toContain('RI_NOTE_1');
 });
 it('reports a configured missing converter and persists cancellation events',async()=>{
  const {root,workspace,documents}=await setup();const previous=process.env.READER_LIBREOFFICE;
  try{
   process.env.READER_LIBREOFFICE=join(root,'missing-soffice.exe');
   const record=await documents.open(workspace.id,'reader.docx',signal());
   await expect(documents.waitReady(record,signal())).rejects.toMatchObject({code:'CONVERTER_UNAVAILABLE'});
   const events=[];for await(const event of documents.jobs.events(workspace.id,record.processingRunId,0,signal()))events.push(event);
   expect(events.at(-1)?.data).toEqual({status:'failed'});
  }finally{if(previous)process.env.READER_LIBREOFFICE=previous;else delete process.env.READER_LIBREOFFICE;}
  const controller=new AbortController();const record=await documents.open(workspace.id,'reader.md',controller.signal);controller.abort();
  await expect(documents.waitReady(record,signal())).rejects.toMatchObject({code:'CANCELLED'});
  const events=[];for await(const event of documents.jobs.events(workspace.id,record.processingRunId,0,signal()))events.push(event);
  expect(events.at(-1)?.data).toEqual({status:'cancelled'});
 });
 it('serves versioned documents and authorized assets over authenticated HTTP',async()=>{
  const {root}=await setup();const configDir=join(root,'..','http-config');
  const runtime=await startServer({host:'127.0.0.1',port:0,configDir,noOpen:true,demo:false});cleanup.push(()=>runtime.close());
  const {token}=JSON.parse(await readFile(join(configDir,'connection.json'),'utf8'));
  const request=(path:string,body?:unknown,headers:Record<string,string>={})=>fetch(runtime.url+'/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
  const workspace=await(await request('/workspaces',{root})).json();
  const opened=await request('/workspaces/'+workspace.id+'/documents/open',{relativePath:'reader.md'});expect(opened.status).toBe(202);
  const record=await opened.json();expect(record).not.toHaveProperty('cacheDir');expect(record).not.toHaveProperty('path');
  await runtime.documents.waitReady(record,signal());
  const prefix='/documents/'+record.documentId+'/versions/'+record.version;
  const query='?workspaceId='+workspace.id;
  expect((await(await request(prefix+'/content'+query)).text())).toContain('RI');
  expect((await request(prefix+'/content'+query,undefined,{range:'bytes=0-7'})).status).toBe(206);
  expect((await(await request(prefix+'/search'+query+'&q='+encodeURIComponent('秩'))).json()).length).toBeGreaterThan(0);
  expect((await request(prefix+'/resources'+query+'&path=assets/diagram.png')).status).toBe(200);
  expect((await request(prefix+'/resources'+query+'&path=.reader-workbench/state.sqlite')).status).toBe(404);
  const {createCanvas,loadImage}=await import('@napi-rs/canvas'),image=await loadImage(await readFile(join(root,'assets/diagram.png'))),canvas=createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);const jpeg=canvas.toBuffer('image/jpeg');await writeFile(join(root,'diagram.jpg'),jpeg);
  const picture=await runtime.documents.open(workspace.id,'diagram.jpg',signal());await runtime.documents.waitReady(picture,signal());const response=await request('/documents/'+picture.documentId+'/versions/'+picture.version+'/pages/1/image'+query);expect(response.headers.get('content-type')).toBe('image/jpeg');expect(Buffer.from(await response.arrayBuffer())).toEqual(jpeg);
 });
 it('terminates actual child processes on timeout and cancellation without shell expansion',async()=>{
  const value='中文 & $(not-a-command)';
  expect((await runProcess(process.execPath,['-e','process.stdout.write(process.argv[1])',value],signal(),5000)).stdout).toBe(value);
  await expect(runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],signal(),50)).rejects.toMatchObject({code:'PROCESS_TIMEOUT'});
  const controller=new AbortController();const running=runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],controller.signal,5000);setTimeout(()=>controller.abort(),50);
  await expect(running).rejects.toMatchObject({code:'CANCELLED'});
 });
});
