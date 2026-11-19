import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipSync} from 'fflate';
import {extractNotes} from '../../packages/core/src/documents/notes.js';
import {resolveScopedPath,isDisallowedFilesystemPath} from '../../packages/core/src/workspaces/path-guard.js';
import {browseDirectories,browseDirectoryBrowser} from '../../packages/core/src/workspaces/directory-browser.js';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {loadRuntimeConfig} from '../../packages/core/src/runtime/config.js';
import {officeEnvironment} from '../../packages/core/src/documents/office.js';
import {assertSafeImageDimensions} from '../../packages/core/src/documents/image.js';
import {startServer} from '../../apps/server/src/app.js';

const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});

describe('security hardening regressions',()=>{
 it('blocks UNC and device paths in directory browser and workspace selection',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sec-unc-'));
  cleanup.push(()=>rm(dir,{recursive:true,force:true}));
  const workspaces=new WorkspaceService(join(dir,'config'));
  cleanup.push(()=>workspaces.close());
  for(const bad of ['\\\\attacker.example\\share','//attacker.example/share','\\\\?\\C:\\Windows','\\\\.\\pipe\\test']){
   expect(isDisallowedFilesystemPath(bad)).toBe(true);
   await expect(browseDirectories(bad)).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE',status:403});
   await expect(browseDirectoryBrowser(bad)).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE',status:403});
   await expect(workspaces.select(bad,{callerId:'local-owner',transport:'internal'})).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE',status:403});
  }
 });

 it('blocks Windows NTFS Alternate Data Streams in resolveScopedPath',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'sec-ads-')));
  cleanup.push(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'note.txt'),'hello');
  await expect(resolveScopedPath(root,'note.txt:hidden','read')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE',status:403});
  await expect(resolveScopedPath(root,'note.txt::$DATA','read')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE',status:403});
  await expect(resolveScopedPath(root,'note.txt','read')).resolves.toContain('note.txt');
 });

 it('rejects non-loopback --host values and accepts loopback hosts',async()=>{
  await expect(loadRuntimeConfig(['web','--host','0.0.0.0'])).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  await expect(loadRuntimeConfig(['web','--host','192.168.1.5'])).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  await expect(loadRuntimeConfig(['web','--host','127.0.0.1'])).resolves.toMatchObject({host:'127.0.0.1'});
  await expect(loadRuntimeConfig(['web','--host','localhost'])).resolves.toMatchObject({host:'localhost'});
  await expect(loadRuntimeConfig(['web','--host','::1'])).resolves.toMatchObject({host:'::1'});
 });

 it('extractNotes enforces boundedUnzip limits against spoofed-size PPTX note bombs',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sec-notes-'));
  cleanup.push(()=>rm(dir,{recursive:true,force:true}));
  const payload=new Uint8Array(3*1024*1024);
  payload.fill(65);
  const archive=zipSync({'ppt/notesSlides/notesSlide1.xml':payload},{level:9});
  // Spoof uncompressed size fields in local & central directory headers to 16 bytes
  const view=new DataView(archive.buffer,archive.byteOffset,archive.byteLength);
  for(let i=0;i<=archive.length-30;i++){
   if(view.getUint32(i,true)===0x04034b50)view.setUint32(i+22,16,true);
   if(view.getUint32(i,true)===0x02014b50)view.setUint32(i+24,16,true);
  }
  const file=join(dir,'bomb.pptx');
  await writeFile(file,archive);
  await expect(extractNotes(file)).rejects.toMatchObject({code:'ARCHIVE_LIMIT'});
 });

 it('strips sensitive environment variables from LibreOffice child environment',()=>{
  const previous=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='sk-should-not-leak';
  try{
   const env=officeEnvironment();
   expect(env.OPENAI_API_KEY).toBeUndefined();
  }finally{
   if(previous===undefined)delete process.env.OPENAI_API_KEY;
   else process.env.OPENAI_API_KEY=previous;
  }
 });

 it('rejects oversized PNG header dimensions before decoding',()=>{
  const png=new Uint8Array(32);
  png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);
  const view=new DataView(png.buffer);
  view.setUint32(16,30000,false);
  view.setUint32(20,30000,false);
  expect(()=>assertSafeImageDimensions(png)).toThrow(/IMAGE_TOO_LARGE|超过安全上限/);
  view.setUint32(16,800,false);
  view.setUint32(20,600,false);
  expect(()=>assertSafeImageDimensions(png)).not.toThrow();
 });

 it('sets nosniff, sandbox CSP and attachment disposition on non-PDF translation preview',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sec-preview-')),root=join(dir,'workspace');
  await mkdir(root);
  await writeFile(join(root,'note.md'),'# Hello\n\nWorld');
  const host=await startServer({host:'127.0.0.1',port:0,configDir:join(dir,'config'),noOpen:true,demo:false});
  cleanup.push(()=>rm(dir,{recursive:true,force:true}),()=>host.close());
  const actor={callerId:'local-owner',transport:'internal' as const};
  const workspace=await host.workspaces.select(root,actor);
  const session=await host.sessions.createMain(workspace.id,'sec');
  const document=await host.documents.open(workspace.id,'note.md',new AbortController().signal);
  await host.documents.waitReady(document,new AbortController().signal);
  host.capabilities.register(workspace.id,'model','sec-model',{capabilities:{vision:false,tools:false,contextWindow:100_000},async *generate(request){const input=JSON.parse(request.messages.at(-1)!.content as string);yield{kind:'delta',text:JSON.stringify({translations:input.blocks.map((block:{id:string;text:string})=>({id:block.id,text:'译:'+block.text}))})};yield{kind:'done'};}});
  const headers={authorization:'Bearer '+host.auth.token,host:new URL(host.url).host},prefix='/api/v1/workspaces/'+workspace.id+'/document-processing';
  const started=await host.app.inject({method:'POST',url:prefix,headers,payload:{document,sessionId:session.id,providerId:'sec-model',processorId:'document-translation.translate'}});
  const id=started.json().id;
  for(let i=0;i<100;i++){const poll=await host.app.inject({method:'GET',url:prefix+'/'+id+'?sessionId='+session.id,headers});if(poll.json().status==='ready')break;await new Promise(resolve=>setTimeout(resolve,10));}
  const preview=await host.app.inject({method:'GET',url:prefix+'/'+id+'/preview?sessionId='+session.id,headers});
  expect(preview.statusCode).toBe(200);
  expect(preview.headers['x-content-type-options']).toBe('nosniff');
  expect(preview.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
  expect(String(preview.headers['content-disposition'])).toMatch(/^attachment;/);
 });
});
