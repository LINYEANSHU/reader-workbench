import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,cp,rm,readdir} from 'node:fs/promises';import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';
import {PDFDocument,rgb} from 'pdf-lib';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
const signal=()=>new AbortController().signal;
async function setup(){
 const directory=await mkdtemp(join(tmpdir(),'reader stored path '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const root=join(directory,'workspace'),outside=join(directory,'outside');await mkdir(root);await mkdir(outside);
 const pdf=await PDFDocument.create();pdf.addPage([300,400]).drawRectangle({x:0,y:0,width:300,height:400,color:rgb(1,0,0)});
 const outsidePdf=join(outside,'private.pdf');await writeFile(outsidePdf,await pdf.save());
 await cp('tests/fixtures/reader.pdf',join(root,'public.pdf'));await cp('tests/fixtures/reader.pdf',join(root,'other.pdf'));
 const workspaces=new WorkspaceService(join(directory,'config')),documents=new DocumentService(workspaces);cleanup.push(()=>workspaces.close(),()=>documents.close());
 const workspace=await workspaces.select(root,{callerId:'local-owner',transport:'internal'});
 const open=async(path:string)=>{const document=await documents.open(workspace.id,path,signal());await documents.waitReady(document,signal());return document;};
 const document=await open('public.pdf'),other=await open('other.pdf'),store=await workspaces.storeFor(workspace.id);
 const tamper=async(change:(saved:NonNullable<Awaited<ReturnType<typeof store.documents.get>>>)=>void)=>{const saved=(await store.documents.get(document))!;change(saved);await store.documents.save(saved);};
 return{outside,outsidePdf,documents,document,other,store,tamper};
}
it('renders pages of the stored PDF only from its own document version cache',async()=>{
 const {outside,outsidePdf,documents,document,other,store,tamper}=await setup();
 const page=await documents.readPage(document,1,signal());expect(page.imagePath).toBeTruthy();
 await expect(documents.authorizedFile(document,page.imagePath!)).resolves.toBe(page.imagePath);
 await rm(page.imagePath!);// otherwise the cached render would be returned without reading any PDF
 for(const pdfPath of [outsidePdf,(await store.documents.get(other))!.parsed!.pdfPath!]){
  await tamper(saved=>{saved.parsed!.pdfPath=pdfPath;delete saved.parsed!.pages[0]!.imagePath;});
  await expect(documents.readPage(document,1,signal())).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
 }
 // A tampered page image path is rejected instead of being returned to page or model consumers.
 await tamper(saved=>{saved.parsed!.pdfPath=saved.path;saved.parsed!.pages[0]!.imagePath=outsidePdf;});
 await expect(documents.readPage(document,1,signal())).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
 // A tampered cache directory is ignored: renders land in the cache derived for this document version.
 await tamper(saved=>{delete saved.parsed!.pages[0]!.imagePath;saved.cacheDir=outside;});
 const rendered=await documents.readPage(document,1,signal());
 expect(dirname(rendered.imagePath!)).toBe(dirname((await store.documents.get(document))!.path));
 expect(await readdir(outside)).toEqual(['private.pdf']);
 await expect(documents.content(document,true)).resolves.toMatchObject({mime:'application/pdf'});
});
