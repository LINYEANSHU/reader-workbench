import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,readFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {WorkspaceMemoryService} from '../../packages/core/src/knowledge/service.js';
import {DocumentMemoryStore} from '../../packages/core/src/documents/memory-store.js';
import {PDFDocument} from 'pdf-lib';
import type {WorkspaceMemoryEngine,WorkspaceMemoryItem} from '../../packages/contracts/src/workspace-memory.js';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function setup(){
 const root=await mkdtemp(join(tmpdir(),'reader knowledge 中文 '));cleanup.push(()=>rm(root,{recursive:true,force:true}));
 const directory=join(root,'workspace');await mkdir(directory);
 const workspaces=new WorkspaceService(join(root,'config'));cleanup.push(()=>workspaces.close());
 const documents=new DocumentService(workspaces);cleanup.push(()=>documents.close());
 let contents:WorkspaceMemoryItem[]=[],fail=false;
 const engine:WorkspaceMemoryEngine={available:async()=>true,replace:async(_id,items,signal)=>{signal.throwIfAborted();if(fail)throw Error('engine unavailable');contents=structuredClone(items);},search:async()=>contents.map(item=>item.id),close:async()=>{}};
 const memory=new WorkspaceMemoryService(workspaces,documents,engine);cleanup.push(()=>memory.close());
 const workspace=await workspaces.select(directory,{callerId:'local-owner',transport:'internal'});
 return{root,directory,workspace,workspaces,documents,memory,engine,contents:()=>contents,resetEngine:()=>{contents=[];},fail:()=>{fail=true;}};
}
it('discovers arbitrary nested documents and deduplicates text while retaining every source',async()=>{
 const s=await setup();await mkdir(join(s.directory,'reference'));await mkdir(join(s.directory,'problems'));
 const text='The impedance of a capacitor is Z = 1/(j omega C).';
 await writeFile(join(s.directory,'reference','notes.md'),text);await writeFile(join(s.directory,'problems','exercise.txt'),text);
 await s.memory.sync(s.workspace.id,new AbortController().signal);
 expect(s.contents()).toHaveLength(1);expect(s.contents()[0].sources.map(source=>source.relativePath).sort()).toEqual(['problems/exercise.txt','reference/notes.md']);
 const hits=await s.memory.search(s.workspace.id,'电容的阻抗',new AbortController().signal);
 expect(hits).toHaveLength(1);expect(hits[0].sources).toHaveLength(2);
 expect((await s.memory.status(s.workspace.id)).state).toBe('ready');
 expect(await readFile(join(s.directory,'reference','notes.md'),'utf8')).toBe(text);
});
it('excludes internal, dependency, ignored, credential and symlink paths without following them',async()=>{
 const s=await setup();for(const name of ['.reader-workbench','node_modules','private','nested'])await mkdir(join(s.directory,name),{recursive:true});
 await writeFile(join(s.directory,'.gitignore'),'private/\n');await writeFile(join(s.directory,'nested','.readerignore'),'omitted.md\n');
 for(const name of ['normal.md','secrets.txt','private/hidden.md','node_modules/dependency.md','.reader-workbench/cache.md','nested/omitted.md'])await writeFile(join(s.directory,name),'UNIQUE '+name);
 if(process.platform!=='win32'){await writeFile(join(s.root,'outside.md'),'OUTSIDE');await symlink(join(s.root,'outside.md'),join(s.directory,'linked.md'));}
 await s.memory.sync(s.workspace.id,new AbortController().signal);
 expect(s.contents().flatMap(item=>item.sources.map(source=>source.relativePath))).toEqual(['normal.md']);
});
it('rejects unknown engine IDs and never recalls changed or deleted source versions',async()=>{
 const s=await setup();await writeFile(join(s.directory,'a.md'),'Initial source fact.');await s.memory.sync(s.workspace.id,new AbortController().signal);
 const known=s.contents()[0].id;s.engine.search=async()=>['forged',known,known];
 expect(await s.memory.search(s.workspace.id,'fact',new AbortController().signal)).toHaveLength(1);
 await writeFile(join(s.directory,'a.md'),'Corrected source fact.');s.fail();await expect(s.memory.sync(s.workspace.id,new AbortController().signal)).rejects.toThrow('engine unavailable');
 expect(await s.memory.search(s.workspace.id,'fact',new AbortController().signal)).toEqual([]);
 await rm(join(s.directory,'a.md'));expect(await s.memory.search(s.workspace.id,'fact',new AbortController().signal)).toEqual([]);
});
it('isolates workspaces and preserves all duplicate sources when one file is removed',async()=>{
 const s=await setup();await writeFile(join(s.directory,'a.txt'),'Shared fact.');await writeFile(join(s.directory,'b.txt'),'Shared fact.');await s.memory.sync(s.workspace.id,new AbortController().signal);
 await rm(join(s.directory,'a.txt'));const hits=await s.memory.search(s.workspace.id,'fact',new AbortController().signal);expect(hits[0].sources.map(source=>source.relativePath)).toEqual(['b.txt']);
 const otherPath=join(s.root,'other');await mkdir(otherPath);const other=await s.workspaces.select(otherPath,{callerId:'local-owner',transport:'internal'});
 expect(await s.memory.search(other.id,'fact',new AbortController().signal)).toEqual([]);
});
it('reconciles an unchanged snapshot after engine cache loss and stops recall when disabled',async()=>{
 const s=await setup();await writeFile(join(s.directory,'a.md'),'Remembered fact.');await s.memory.sync(s.workspace.id,new AbortController().signal);
 const restarted=new WorkspaceMemoryService(s.workspaces,s.documents,s.engine);cleanup.push(()=>restarted.close());
 s.resetEngine();await restarted.sync(s.workspace.id,new AbortController().signal);
 expect(await restarted.search(s.workspace.id,'fact',new AbortController().signal)).toHaveLength(1);
 await restarted.configure({enabled:false});expect(await restarted.search(s.workspace.id,'fact',new AbortController().signal)).toEqual([]);
});
it('honors newly added ignore rules immediately, before the next index rebuild',async()=>{
 const s=await setup();await writeFile(join(s.directory,'private-notes.md'),'A source that will be excluded.');await s.memory.sync(s.workspace.id,new AbortController().signal);
 await writeFile(join(s.directory,'.readerignore'),'private-notes.md\n');expect(await s.memory.search(s.workspace.id,'source',new AbortController().signal)).toEqual([]);
});
it('restores engine consistency after an interrupted publication and reverting source files',async()=>{
 const s=await setup(),signal=new AbortController().signal;
 await writeFile(join(s.directory,'a.md'),'Original source A.');await s.memory.sync(s.workspace.id,signal);
 const replace=s.engine.replace;let calls=0;
 s.engine.replace=async(...args)=>{await replace(...args);if(++calls===1)throw Error('interrupted after engine commit');};
 await writeFile(join(s.directory,'a.md'),'Changed source B.');await expect(s.memory.sync(s.workspace.id,signal)).rejects.toThrow('interrupted');
 await writeFile(join(s.directory,'a.md'),'Original source A.');await s.memory.sync(s.workspace.id,signal);
 expect((await s.memory.search(s.workspace.id,'source',signal)).map(hit=>hit.text)).toEqual(['Original source A.']);
});
it('shares concurrent refreshes and does not publish a cancelled graph build',async()=>{
 const s=await setup();await writeFile(join(s.directory,'a.md'),'A source fact.');let count=0,entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve);
 s.engine.replace=async(_id,_items,signal)=>{count++;entered();await new Promise<void>((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});};
 const controller=new AbortController(),first=s.memory.sync(s.workspace.id,controller.signal),second=s.memory.sync(s.workspace.id,controller.signal);await started;controller.abort();
 const results=await Promise.allSettled([first,second]);expect(results.every(result=>result.status==='rejected')).toBe(true);expect(count).toBe(1);
 expect((await s.memory.status(s.workspace.id)).state).toBe('failed');expect(await s.memory.search(s.workspace.id,'fact',new AbortController().signal)).toEqual([]);
});
it('applies a newly narrowed reading range to recalled evidence from another document',async()=>{
 const s=await setup(),pdf=await PDFDocument.create();pdf.addPage().drawText('SOURCE_ONE capacitor impedance');pdf.addPage().drawText('SOURCE_TWO unrelated hidden page');await writeFile(join(s.directory,'source.pdf'),await pdf.save());
 await s.memory.sync(s.workspace.id,new AbortController().signal);const document=await s.documents.open(s.workspace.id,'source.pdf',new AbortController().signal);
 await new DocumentMemoryStore(s.workspaces).setReadingPlan(await s.documents.get(document),[1]);
 const hits=await s.memory.search(s.workspace.id,'source',new AbortController().signal);
 expect(hits.length).toBeGreaterThan(0);expect(hits.flatMap(hit=>hit.sources.map(source=>source.page))).toEqual([1]);
});
it('lets a nested ignore file reinclude files excluded by an inherited wildcard',async()=>{
 const s=await setup();await mkdir(join(s.directory,'nested'));await writeFile(join(s.directory,'.gitignore'),'*.txt\n');await writeFile(join(s.directory,'nested','.readerignore'),'!included.txt\n');
 await writeFile(join(s.directory,'nested','included.txt'),'An explicitly included source.');await writeFile(join(s.directory,'nested','excluded.txt'),'An excluded source.');
 await s.memory.sync(s.workspace.id,new AbortController().signal);expect(s.contents().flatMap(item=>item.sources.map(source=>source.relativePath))).toEqual(['nested/included.txt']);
});
