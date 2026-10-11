import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {basename,extname} from 'node:path';
import {join} from 'node:path';
import type {ArtifactInput,ArtifactRecord,ContentBlock} from '../../../contracts/src/artifacts.js';import type {RunScope,WorkspaceId,ArtifactId,SessionId} from '../../../contracts/src/ids.js';import type {SourceAnchor,DocumentRef} from '../../../contracts/src/documents.js';import type {ArtifactExporter} from '../../../sdk/src/capabilities.js';
import type {WorkspaceService} from '../workspaces/service.js';import type {SessionRepository} from '../sessions/repository.js';import type {DocumentService} from '../documents/service.js';import {CapabilityRegistry} from '../plugins/registry.js';import {ReaderError} from '../../../contracts/src/errors.js';import {KeyedQueue} from '../runs/queue.js';
import {artifactInputSchema} from './input.js';import {atomicWrite} from './atomic-write.js';import {markdownExporter} from './markdown.js';import {docxExporter} from './docx.js';import {pptxExporter} from './pptx.js';import {pdfExporter} from './pdf.js';
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const binaryExporter:ArtifactExporter={formats:['binary'],export:async(input,_scope,signal)=>{signal.throwIfAborted();if(!input.bytes)throw new ReaderError('ARTIFACT_BYTES_REQUIRED','二进制输出缺少内容');return{bytes:input.bytes,mime:input.mime??'application/octet-stream',extension:extname(input.name)};}};
export class ArtifactService{
 private queue=new KeyedQueue();private pending=new Map<AbortController,Promise<ArtifactRecord>>();private closed=false;
 constructor(readonly workspaces:WorkspaceService,readonly repository:SessionRepository,readonly documents:DocumentService,readonly registry:CapabilityRegistry){
  for(const [id,exporter]of Object.entries({markdown:markdownExporter,docx:docxExporter,pptx:pptxExporter,pdf:pdfExporter(workspaces),binary:binaryExporter}))registry.register('*','exporter','core.'+id,exporter);
 }
 create(raw:ArtifactInput,scope:RunScope,signal:AbortSignal):Promise<ArtifactRecord>{
  if(this.closed)return Promise.reject(new ReaderError('SERVER_CLOSING','文件服务正在退出',503));
  const controller=new AbortController(),task=this.createOperation(raw,scope,AbortSignal.any([signal,controller.signal]));this.pending.set(controller,task);return task.finally(()=>this.pending.delete(controller));
 }
 async close(){this.closed=true;for(const controller of this.pending.keys())controller.abort();await Promise.allSettled([...this.pending.values()]);}
 async getOutputDirectory(workspaceId:WorkspaceId){return(await this.workspaces.storeFor(workspaceId)).getRecord<{directory:string}>('settings','output')?.directory??'outputs';}
 async setOutputDirectory(workspaceId:WorkspaceId,input:string){
  if(typeof input!=='string'||input.length>400)throw new ReaderError('PATH_OUTSIDE_WORKSPACE','输出目录无效',403);const directory=input.replaceAll('\\','/');
  if(!directory||directory.split('/').some(segment=>!segment||segment==='.'||segment==='..'||/[\\:*?"<>|\u0000-\u001f]/.test(segment)||/[. ]$/.test(segment)))throw new ReaderError('PATH_OUTSIDE_WORKSPACE','请输入工作区内的相对输出目录',403);
  const workspace=await this.workspaces.get(workspaceId),path=await this.workspaces.resolvePath(workspaceId,directory,'create');if(path!==join(workspace.root,directory))throw new ReaderError('PATH_OUTSIDE_WORKSPACE','输出目录不能重定向',403);
  (await this.workspaces.storeFor(workspaceId)).putRecord('settings','output',{directory});return{directory};
 }
 private async createOperation(raw:ArtifactInput,scope:RunScope,signal:AbortSignal):Promise<ArtifactRecord>{
  await this.repository.authorizeScope(scope);if(!scope.allowArtifactWrites)throw new ReaderError('TOOL_SCOPE_DENIED','本次运行未允许生成文件',403);
  const parsed=artifactInputSchema.safeParse(raw);if(!parsed.success)throw new ReaderError('ARTIFACT_INPUT_INVALID','生成内容格式无效');const input=parsed.data as ArtifactInput;
  if(input.name!==basename(input.name)||/[\\/:*?"<>|\u0000-\u001f]/.test(input.name)||input.name==='.'||input.name==='..'||/[. ]$/.test(input.name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(input.name))throw new ReaderError('INVALID_FILENAME','输出文件名称无效');
  const identity=JSON.stringify({...input,bytes:input.bytes?digest(input.bytes):undefined,blocks:input.blocks.map(block=>block.kind==='image'?{...block,data:digest(block.data)}:block)});
  const id=digest(Buffer.from(scope.workspaceId+'/'+scope.sessionId+'/'+scope.runId+'/'+identity)).slice(0,32) as ArtifactId;
  return this.queue.enqueue(scope.workspaceId+'/'+id,async()=>{
   signal.throwIfAborted();await this.repository.authorizeScope(scope);const store=await this.workspaces.storeFor(scope.workspaceId),previous=await store.artifacts.get(id);if(previous){await this.download(scope.workspaceId,id);return previous;}
   if(store.getRecord('artifact-executions',id))throw new ReaderError('ARTIFACT_EXECUTION_UNCERTAIN','此前文件提交未确认完成，请检查输出目录后使用新的请求标识');
   const documents=new Map<string,DocumentRef>();for(const anchor of input.sourceAnchors){await this.validateAnchor(anchor,scope,signal);documents.set(anchor.documentId+':'+anchor.version,anchor);}
   const sourceIds=new Set<string>(),allIds:string[]=[];for(const ref of documents.values())for(const block of (await this.documents.parsed(ref)).blocks){sourceIds.add(block.id);allIds.push(block.id);}
   if(input.coverage?.sourceBlockIds.some(id=>!sourceIds.has(id)))throw new ReaderError('COVERAGE_INCOMPLETE','覆盖信息包含未引用的来源');
   if(input.coverage?.status==='complete'&&(!allIds.length||allIds.some(id=>!input.coverage!.sourceBlockIds.includes(id))))throw new ReaderError('COVERAGE_INCOMPLETE','尚未覆盖完整来源，不能标记全文完成');
   const prelude:ContentBlock[]=[];if(input.coverage)prelude.push({kind:'paragraph',text:'阅读范围: '+(input.coverage.status==='partial'?'部分内容':'完整来源覆盖')+(input.coverage.note?' — '+input.coverage.note:'')});
   const sourceLabels=await Promise.all([...documents.values()].map(async ref=>{const source=await this.documents.get(ref);const pages=[...new Set(input.sourceAnchors.filter(anchor=>anchor.documentId===ref.documentId&&anchor.version===ref.version&&anchor.location.kind==='page').map(anchor=>anchor.location.kind==='page'?anchor.location.page:0))];return source.relativePath+' · 版本 '+ref.version.slice(0,12)+(pages.length?' · 第 '+pages.join('、')+' 页':' · 所选文本片段');}));
   const footer:ContentBlock[]=sourceLabels.length?[{kind:'paragraph',text:'来源: '+sourceLabels.join('\n')}]:[];
   const ids=this.registry.list(scope.workspaceId,'exporter').sort((a,b)=>Number(a.startsWith('core.'))-Number(b.startsWith('core.')));
   const exporterId=ids.find(id=>this.registry.get(scope.workspaceId,'exporter',id).formats?.includes(input.format));if(!exporterId)throw new ReaderError('EXPORTER_UNAVAILABLE','没有支持此格式的导出器');
   const lease=this.registry.acquire(scope.workspaceId,'exporter',exporterId);let output;try{output=await lease.value.export({...input,blocks:[...prelude,...input.blocks,...footer]},scope,signal);}finally{lease.release();}
   signal.throwIfAborted();await this.repository.authorizeScope(scope);
   if(!(output.bytes instanceof Uint8Array)||!output.bytes.length||output.bytes.length>64*1024*1024||!(output.extension===''||/^\.[a-zA-Z0-9]{1,16}$/.test(output.extension))||input.format!=='binary'&&output.extension!=='.'+input.format||!output.mime||/[\r\n]/.test(output.mime))throw new ReaderError('EXPORTER_RESULT_INVALID','导出器未返回可用文件');
   store.putRecord('artifact-executions',id,{status:'started',runId:scope.runId});let rollback:(()=>Promise<void>)|undefined;
   try{
    const published=await atomicWrite(this.workspaces,scope,input.name,output.extension,output.bytes,signal);rollback=published.rollback;
    const path=await this.workspaces.resolvePath(scope.workspaceId,published.relativePath,'read'),sha256=digest(await readFile(path,{signal}));if(sha256!==digest(output.bytes))throw new ReaderError('ARTIFACT_HASH_FAILED','输出文件校验失败');
    signal.throwIfAborted();await this.repository.authorizeScope(scope);
    const record:ArtifactRecord={id,workspaceId:scope.workspaceId,sessionId:scope.sessionId,runId:scope.runId,relativePath:published.relativePath,mime:output.mime,sha256,sourceAnchors:input.sourceAnchors,coverage:input.coverage,warnings:output.warnings??[]};
    await store.artifacts.save(record);return record;
   }catch(error){if(rollback){try{await rollback();store.deleteRecord('artifact-executions',id);}catch{}}else store.deleteRecord('artifact-executions',id);throw error;}
  });
 }
 private async validateAnchor(anchor:SourceAnchor,scope:RunScope,signal:AbortSignal){
  if(anchor.workspaceId!==scope.workspaceId)throw new ReaderError('TOOL_SCOPE_DENIED','输出来源不能越过工作区',403);await this.documents.waitReady(anchor,signal);
  if(anchor.location.kind==='page'){if(anchor.location.page>(await this.documents.get(anchor)).pageCount)throw new ReaderError('SOURCE_ANCHOR_INVALID','来源页码无效');}
  else{const block=await this.documents.readBlock(anchor,anchor.location.blockId);if(anchor.location.start>anchor.location.end||anchor.location.end>block.text.length)throw new ReaderError('SOURCE_ANCHOR_INVALID','来源文字范围无效');}
 }
 async list(workspaceId:WorkspaceId,sessionId?:SessionId){return(await this.workspaces.storeFor(workspaceId)).artifacts.list(sessionId);}
 async get(workspaceId:WorkspaceId,id:ArtifactId){const record=await(await this.workspaces.storeFor(workspaceId)).artifacts.get(id);if(!record)throw new ReaderError('ARTIFACT_UNAVAILABLE','此工作区中不存在该输出',404);return record;}
 async download(workspaceId:WorkspaceId,id:ArtifactId){const record=await this.get(workspaceId,id),path=await this.workspaces.resolvePath(workspaceId,record.relativePath,'read');if(digest(await readFile(path))!==record.sha256)throw new ReaderError('ARTIFACT_CHANGED','输出文件已被修改，请从文件树打开新版本');return{path,mime:record.mime};}
 async open(workspaceId:WorkspaceId,id:ArtifactId){const record=await this.get(workspaceId,id);await this.download(workspaceId,id);return this.documents.open(workspaceId,record.relativePath,new AbortController().signal);}
}
