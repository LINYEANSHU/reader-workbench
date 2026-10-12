import type {FastifyInstance} from 'fastify';import type {Authentication} from '../auth.js';import type {DocumentMemoryConsumer} from '../../../../packages/core/src/documents/memory-consumer.js';import type {WorkspaceService} from '../../../../packages/core/src/workspaces/service.js';import type {WorkspaceId,DocumentId,DocumentVersion} from '../../../../packages/contracts/src/ids.js';import {ReaderError} from '../../../../packages/contracts/src/errors.js';
export function documentMemoryRoutes(app:FastifyInstance,memory:DocumentMemoryConsumer,workspaces:WorkspaceService,auth:Authentication){
 type Route={Params:{id:WorkspaceId;documentId:DocumentId;version:DocumentVersion;page?:string};Querystring:{providerId?:string};Body?:{providerId?:string}};
 const prefix='/api/v1/workspaces/:id/documents/:documentId/:version/memory';
 const lookup=async(request:import('fastify').FastifyRequest<Route>,loadRecord=true)=>{
  if(!(await workspaces.listRecent(auth.actor(request))).some(workspace=>workspace.id===request.params.id))throw new ReaderError('WORKSPACE_DENIED','工作区不属于此调用者',403);
  const ref={workspaceId:request.params.id,documentId:request.params.documentId,version:request.params.version},document=await memory.documents.get(ref),id=memory.capabilities.list(ref.workspaceId,'documentMemory').at(-1),providerId=request.query.providerId??request.body?.providerId;
  if(typeof providerId!=='string'||!providerId||providerId.length>100)throw new ReaderError('MODEL_REQUIRED','请选择用于此文档的模型');
  const model=memory.capabilities.acquire(ref.workspaceId,'model',providerId);try{
   if(!id)return{ref,document,status:'disabled' as const,generation:0,key:null,record:null};
   const provider=memory.capabilities.acquire(ref.workspaceId,'documentMemory',id);try{const pluginId=id.slice(0,id.lastIndexOf('.')),key=memory.store.key(ref,pluginId,provider.value.promptVersion,memory.identity(model.value,providerId)),generation=await memory.store.generation(ref,key),record=loadRecord?await memory.store.load(ref,key,generation):null;return{ref,document,status:record?.status??'not-started',generation,key,record};}finally{provider.release();}
  }finally{model.release();}
 };
 app.get<Route>(prefix,async request=>{const value=await lookup(request);return{status:value.status,generation:value.generation,pageCount:value.document.pageCount,completedPages:value.record?.completedPages??[],overview:value.record?.overview??'',localPreparation:memory.localStatus(value.ref)};});
 app.get<Route>(prefix+'/pages/:page',async request=>{const value=await lookup(request),number=Number(request.params.page);if(!Number.isSafeInteger(number)||number<1)throw new ReaderError('PAGE_UNAVAILABLE','页码无效',404);const page=value.record?.pages.find(item=>item.page===number);if(!page)throw new ReaderError('DOCUMENT_MEMORY_UNAVAILABLE','此页尚未建立阅读记忆',404);return page;});
 app.post<Route>(prefix+'/rebuild',async request=>{const value=await lookup(request,false);if(!value.key)throw new ReaderError('DOCUMENT_MEMORY_UNAVAILABLE','请先启用文档阅读记忆插件');return{generation:await memory.store.requestRebuild(value.ref,value.key),status:'not-started'};});
}
