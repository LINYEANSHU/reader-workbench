import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile,readdir,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {PDFDocument} from 'pdf-lib';
import {PdfDocumentCache,renderPdfPage} from '../../packages/core/src/documents/pdf.js';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
async function files(count:number){const directory=await mkdtemp(join(tmpdir(),'render-cache-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const paths:string[]=[];for(let index=0;index<count;index++){const path=join(directory,'f'+index+'.pdf');await writeFile(path,'x'.repeat(index+1));paths.push(path);}return{directory,paths};}
it('opens a document once for consecutive renders, keeps two open and closes idle ones',async()=>{
 const {paths}=await files(3),loads:string[]=[],released:string[]=[];
 const cache=new PdfDocumentCache(async path=>{loads.push(path);return{pdf:{numPages:1} as never,release:async()=>{released.push(path);}};},2,30);
 for(let index=0;index<3;index++)await cache.use(paths[0]!,async pdf=>pdf);
 expect(loads).toEqual([paths[0]]);
 await cache.use(paths[1]!,async pdf=>pdf);await cache.use(paths[2]!,async pdf=>pdf);await delay(1);expect(released).toEqual([paths[0]]);
 await delay(80);expect(released.sort()).toEqual([...paths].sort());
});
it('reopens a file that was regenerated in place and never closes a document while it is in use',async()=>{
 const {paths}=await files(1),loads:number[]=[],released:number[]=[];let generation=0;
 const cache=new PdfDocumentCache(async()=>{const id=++generation;loads.push(id);return{pdf:{numPages:1} as never,release:async()=>{released.push(id);}};},1,10_000);
 await cache.use(paths[0]!,async pdf=>pdf);await writeFile(paths[0]!,'changed content');
 let finish!:()=>void;const busy=cache.use(paths[0]!,()=>new Promise(resolve=>finish=()=>resolve(undefined)));await delay(5);
 cache.closeAll();await delay(1);expect(loads).toEqual([1,2]);expect(released).toEqual([1]);finish();await busy;
});
it('renders a page into the cache directory without leaving temporary files and reuses it',async()=>{
 const {directory}=await files(0),pdf=await PDFDocument.create();pdf.addPage([200,200]).drawText('Page');const path=join(directory,'doc.pdf');await writeFile(path,await pdf.save());
 const first=await renderPdfPage(path,1,directory,new AbortController().signal);expect((await readFile(first)).subarray(0,4)).toEqual(Buffer.from([137,80,78,71]));
 expect(await renderPdfPage(path,1,directory,new AbortController().signal)).toBe(first);expect((await readdir(directory)).filter(name=>name.endsWith('.tmp'))).toEqual([]);
});
