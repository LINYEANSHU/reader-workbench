import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {join,basename,dirname,extname,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {WorkspaceService} from '../workspaces/service.js';
import {CapabilityRegistry} from '../plugins/registry.js';
import type {DocumentRef,DocumentRecord,DocumentPage,SearchHit,ParsedDocument,DocumentBlock,StoredDocument} from '../../../contracts/src/documents.js';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {snapshot,safeCacheDirectory,mimeFor} from './versions.js';
import {DocumentJobService} from './jobs.js';
import {DocumentIndex} from './index.js';
import {markdownAdapter} from './markdown.js';import {textAdapter} from './text.js';import {pdfAdapter,renderPdfPage} from './pdf.js';
import {officeAdapter} from './office.js';import {imageAdapter} from './image.js';import {binaryAdapter} from './binary.js';
import {isWithin} from '../workspaces/path-guard.js';
import {markdownResources} from './markdown-resources.js';import {resourceUri} from '../../../contracts/src/resource-uri.js';import {KeyedQueue} from '../runs/queue.js';
type SavedDocument=StoredDocument;
export class DocumentService {
 onParsed?:(ref:DocumentRef)=>void;
 private pageRenders=new KeyedQueue();
 readonly registry:CapabilityRegistry;readonly jobs:DocumentJobService;
 private resourceRepairs=new KeyedQueue();
 constructor(readonly workspaces:WorkspaceService,registry?:CapabilityRegistry){
  this.registry=registry??new CapabilityRegistry();this.jobs=new DocumentJobService(workspaces);
  const builtins={markdown:markdownAdapter,text:textAdapter,pdf:pdfAdapter,office:officeAdapter,image:imageAdapter,binary:binaryAdapter};
  for(const [id,adapter]of Object.entries(builtins))if(!this.registry.list('*' as WorkspaceId,'document').includes('core.'+id))this.registry.register('*','document','core.'+id,adapter);
  if(!this.registry.list('*' as WorkspaceId,'viewer').includes('core.viewer'))this.registry.register('*','viewer','core.viewer',{describe:record=>{
   const extension=extname(record.relativePath).toLowerCase();
   return {kind:record.mime==='text/markdown'?'markdown':record.mime==='text/plain'?'text':record.mime==='application/pdf'||['.doc','.docx','.ppt','.pptx'].includes(extension)?'pdf':record.mime.startsWith('image/')?'image':'fallback'};
  }});
 }
 private key(ref:DocumentRef){return ref.documentId+':'+ref.version;}
 private async saved(ref:DocumentRef):Promise<SavedDocument>{
  const saved=await(await this.workspaces.storeFor(ref.workspaceId)).documents.get(ref);
  if(!saved||saved.record.workspaceId!==ref.workspaceId)throw new ReaderError('DOCUMENT_UNAVAILABLE','此工作区中不存在该文档版本',404);return saved;
 }
 async open(workspaceId:WorkspaceId,relativePath:string,signal:AbortSignal):Promise<DocumentRecord>{
  const input=await snapshot(this.workspaces,workspaceId,relativePath,signal);const store=await this.workspaces.storeFor(workspaceId);
  const previous=await store.documents.get(input),old=previous?.record.workspaceId===workspaceId?previous:null;
  if(old&&old.record.workspaceId===workspaceId&&old.record.parseState==='ready'){this.onParsed?.(input);return this.get(input);}
  if(old&&['queued','converting','indexing'].includes(old.record.parseState)){
   const job=await this.jobs.get(workspaceId,old.record.processingRunId);
   if(['queued','running'].includes(job.status))return old.record;
  }
  const record:DocumentRecord={...input,id:input.documentId,relativePath,mime:input.mime,viewer:{kind:'fallback'},parseState:'queued',pageCount:0,processingRunId:'' as DocumentRecord['processingRunId'],warnings:[]};
  // Persist public record explicitly; paths and cacheDir stay server-only.
  const {path:_path,cacheDir:_cacheDir,extension:_extension,...publicRecord}=record as DocumentRecord&{path?:string;cacheDir?:string;extension?:string};
  const viewerIds=this.registry.list(workspaceId,'viewer').sort(id=>id.startsWith('core.')?1:-1);
  publicRecord.viewer=this.registry.get(workspaceId,'viewer',viewerIds[0]!).describe(publicRecord);
  const saved:SavedDocument={record:publicRecord,path:input.path,cacheDir:input.cacheDir};
  publicRecord.processingRunId=await this.jobs.enqueue(workspaceId,input.documentId,async jobSignal=>{
   const office=['.doc','.docx','.ppt','.pptx'].includes(input.extension);
   publicRecord.parseState=office?'converting':'indexing';await store.documents.save(saved);
   const ids=this.registry.list(workspaceId,'document').sort((a,b)=>(a==='core.binary'?2:a.startsWith('core.')?1:0)-(b==='core.binary'?2:b.startsWith('core.')?1:0));
   const adapterId=ids.find(id=>this.registry.get(workspaceId,'document',id).supports(input.mime,input.extension));
   if(!adapterId)throw new ReaderError('DOCUMENT_ADAPTER_UNAVAILABLE','没有可用解析器');
   const lease=this.registry.acquire(workspaceId,'document',adapterId);
   try{
    saved.parsed=await lease.value.parse(input,jobSignal);jobSignal.throwIfAborted();
    publicRecord.pageCount=saved.parsed.pages.length;publicRecord.warnings=saved.parsed.warnings;
    if(input.mime==='text/markdown'){saved.resources=await this.snapshotResources(input.workspaceId,relativePath,input.cacheDir,saved.parsed.pages[0]?.text??'',jobSignal);saved.resourceVersion=1;}
    await new DocumentIndex(store).replace(input,saved.parsed.blocks);publicRecord.parseState='ready';
   }catch(error){publicRecord.parseState=jobSignal.aborted?'cancelled':'failed';throw error;}
   finally{lease.release();await store.documents.save(saved);if(publicRecord.parseState==='ready')this.onParsed?.(input);}
  },signal);
  await store.documents.save(saved);this.workspaces.onLifecycle?.({workspaceId,kind:'document.opened',data:{documentId:input.documentId,version:input.version}});return structuredClone(publicRecord);
 }
 private async snapshotResources(workspaceId:WorkspaceId,relativePath:string,cacheDir:string,text:string,signal:AbortSignal,previous:SavedDocument['resources']={}){
  const resources:Record<string,{path:string;mime:string}>=Object.fromEntries(Object.entries(previous).map(([name,resource])=>[resourceUri(name),resource]));
  for(const name of markdownResources(text)){
   if(resources[name]||/^[a-z][a-z0-9+.-]*:/i.test(name)||name.startsWith('/'))continue;
   try{const relative=join(dirname(relativePath),decodeURIComponent(name));const path=await this.workspaces.resolvePath(workspaceId,relative,'read');
    const mime=mimeFor(path);if(!['image/png','image/jpeg','image/webp'].includes(mime))continue;
    const bytes=await readFile(path,{signal});if(bytes.length>12*1024*1024)continue;
    const hash=createHash('sha256').update(bytes).digest('hex');const destination=join(cacheDir,'asset-'+hash+extname(path));await writeFile(destination,bytes,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    resources[name]={path:destination,mime};
   }catch{}}
  return resources;
 }
 async import(workspaceId:WorkspaceId,name:string,bytes:Uint8Array,signal:AbortSignal):Promise<DocumentRecord>{
  if(name!==basename(name)||/[\\/:]/.test(name)||!name||name==='.'||name==='..')throw new ReaderError('INVALID_FILENAME','文件名无效');
  signal.throwIfAborted();const workspace=await this.workspaces.get(workspaceId);
  const imports=join(workspace.root,'imports');const guarded=await this.workspaces.resolvePath(workspaceId,'imports','create');
  if(guarded!==imports)throw new ReaderError('PATH_OUTSIDE_WORKSPACE','导入目录路径异常');
  const {mkdir}=await import('node:fs/promises');await mkdir(imports,{recursive:true});
  const relative='imports/'+randomUUID()+'-'+name;const path=await this.workspaces.resolvePath(workspaceId,relative,'create');
  await writeFile(path,bytes,{flag:'wx',signal});return this.open(workspaceId,relative,signal);
 }
 async get(ref:DocumentRef):Promise<DocumentRecord>{
  let saved=await this.saved(ref);
  if(saved.record.parseState==='ready'&&saved.record.mime==='text/markdown'&&saved.resourceVersion!==1){await this.resourceRepairs.enqueue(ref.workspaceId+':'+this.key(ref),async()=>{const current=await this.saved(ref);if(current.resourceVersion===1)return;const previous=current.resources??{},repaired=await this.snapshotResources(ref.workspaceId,current.record.relativePath,await safeCacheDirectory(this.workspaces,ref.workspaceId,['cache',ref.documentId,ref.version]),current.parsed?.pages[0]?.text??'',new AbortController().signal,previous);if(Object.keys(repaired).length>Object.keys(previous).length)current.record.warnings.push('旧版未快照的图片已补充为修复时的本地版本；原有图片快照已保留。');current.resources=repaired;current.resourceVersion=1;await(await this.workspaces.storeFor(ref.workspaceId)).documents.save(current);});saved=await this.saved(ref);}
  if(['queued','converting','indexing'].includes(saved.record.parseState)){
   const job=await this.jobs.get(ref.workspaceId,saved.record.processingRunId);
   if(job.status==='failed'||job.status==='cancelled'){saved.record.parseState=job.status;await(await this.workspaces.storeFor(ref.workspaceId)).documents.save(saved);}
  }
  return saved.record;
 }
 async waitReady(ref:DocumentRef,signal:AbortSignal):Promise<DocumentRecord>{
  for(;;){signal.throwIfAborted();const record=await this.get(ref);
   if(record.parseState==='ready')return record;
   if(record.parseState==='failed'||record.parseState==='cancelled'){const job=await this.jobs.get(ref.workspaceId,record.processingRunId);throw new ReaderError(job.error?.code??'DOCUMENT_PARSE_FAILED',job.error?.message??'文档解析失败');}
   await delay(20,undefined,{signal});
  }
 }
 async parsed(ref:DocumentRef):Promise<ParsedDocument>{const saved=await this.saved(ref);if(!saved.parsed||saved.record.parseState!=='ready')throw new ReaderError('DOCUMENT_NOT_READY','文档仍在处理或处理失败',409);return saved.parsed;}
 async readPage(ref:DocumentRef,page:number,signal:AbortSignal=new AbortController().signal):Promise<DocumentPage>{return this.pageRenders.enqueue(ref.workspaceId+'/'+this.key(ref),async()=>{
  signal.throwIfAborted();
  const saved=await this.saved(ref),parsed=await this.parsed(ref);const result=parsed.pages.find(item=>item.page===page);
  if(!result)throw new ReaderError('PAGE_UNAVAILABLE','页码不存在',404);
  if(parsed.pdfPath&&!result.imagePath){result.imagePath=await renderPdfPage(parsed.pdfPath,page,saved.cacheDir,signal);signal.throwIfAborted();saved.parsed=parsed;await(await this.workspaces.storeFor(ref.workspaceId)).documents.save(saved);}
  return result;
 });}
 async readBlock(ref:DocumentRef,id:string):Promise<DocumentBlock>{const block=(await this.parsed(ref)).blocks.find(item=>item.id===id);if(!block)throw new ReaderError('BLOCK_UNAVAILABLE','文档块不存在',404);return block;}
 async search(ref:DocumentRef,query:string,limit:number):Promise<SearchHit[]>{await this.parsed(ref);if(!query.trim())return [];return new DocumentIndex(await this.workspaces.storeFor(ref.workspaceId)).search(ref,query,Math.max(1,Math.min(limit||20,100)));}
 async list(workspaceId:WorkspaceId):Promise<DocumentRecord[]>{return(await(await this.workspaces.storeFor(workspaceId)).documents.list()).map(saved=>saved.record);}
 async authorizedFile(ref:DocumentRef,path:string):Promise<string>{
  await this.saved(ref);const directory=await safeCacheDirectory(this.workspaces,ref.workspaceId,['cache',ref.documentId,ref.version]);
  const actual=await realpath(path);if(!isWithin(directory,actual)||actual!==resolve(path))throw new ReaderError('PATH_OUTSIDE_WORKSPACE','缓存文件不能越过该文档版本',403);
  return actual;
 }
 async content(ref:DocumentRef,preview=false):Promise<{path:string;mime:string}>{
  const saved=await this.saved(ref);
  if(preview&&saved.record.viewer.kind==='pdf'&&saved.record.mime!=='application/pdf'&&!saved.parsed?.pdfPath)throw new ReaderError('DOCUMENT_NOT_READY','Office 转换尚未完成或转换器不可用',409);
  const path=preview?saved.parsed?.pdfPath??saved.path:saved.path;
  return {path:await this.authorizedFile(ref,path),mime:preview&&saved.parsed?.pdfPath?'application/pdf':saved.record.mime};
 }
 async resource(ref:DocumentRef,name:string){await this.get(ref);const resource=(await this.saved(ref)).resources?.[resourceUri(name)];if(!resource)throw new ReaderError('RESOURCE_UNAVAILABLE','引用资源不存在或未授权',404);return {...resource,path:await this.authorizedFile(ref,resource.path)};}
 async close(){await this.jobs.close();}
}
