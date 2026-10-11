import type {FastifyInstance} from 'fastify';import {randomUUID} from 'node:crypto';import {z} from 'zod';
import type {WorkspaceId,SessionId,ArtifactId,RunId,RunScope} from '../../../../packages/contracts/src/ids.js';import type {ArtifactInput} from '../../../../packages/contracts/src/artifacts.js';import type {ArtifactService} from '../../../../packages/core/src/artifacts/service.js';import type {Authentication} from '../auth.js';import {ReaderError} from '../../../../packages/contracts/src/errors.js';import {artifactInputSchema} from '../../../../packages/core/src/artifacts/input.js';import {sendDocumentFile} from './documents.js';
export function artifactRoutes(app:FastifyInstance,artifacts:ArtifactService,auth:Authentication){
 app.post('/api/v1/artifacts',async(request,reply)=>{
  const value=z.object({workspaceId:z.string(),sessionId:z.string(),input:artifactInputSchema}).safeParse(request.body);if(!value.success)throw new ReaderError('INVALID_REQUEST','输出请求格式无效');
  const actor=auth.actor(request),scope:RunScope={actor,workspaceId:value.data.workspaceId as WorkspaceId,sessionId:value.data.sessionId as SessionId,runId:randomUUID() as RunId,allowArtifactWrites:true,outputDirectory:await artifacts.getOutputDirectory(value.data.workspaceId as WorkspaceId)};
  const session=await artifacts.repository.getSession(scope.workspaceId,scope.sessionId);if(session.callerId!==actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','会话不属于此调用者',403);
  const release=await artifacts.repository.registerScope(scope),controller=new AbortController();const abort=()=>{if(!reply.raw.writableEnded)controller.abort();};request.raw.on('aborted',abort);reply.raw.on('close',abort);
  try{reply.code(201);return await artifacts.create(value.data.input as ArtifactInput,scope,controller.signal);}finally{release();request.raw.off('aborted',abort);reply.raw.off('close',abort);}
 });
 app.get<{Querystring:{workspaceId:WorkspaceId;sessionId?:SessionId}}>('/api/v1/artifacts',request=>artifacts.list(request.query.workspaceId,request.query.sessionId));
 app.get<{Params:{id:WorkspaceId}}>('/api/v1/workspaces/:id/settings/output',async request=>({directory:await artifacts.getOutputDirectory(request.params.id)}));
 app.put<{Params:{id:WorkspaceId};Body:{directory:string}}>('/api/v1/workspaces/:id/settings/output',request=>artifacts.setOutputDirectory(request.params.id,request.body?.directory));
 app.get<{Params:{id:ArtifactId};Querystring:{workspaceId:WorkspaceId}}>('/api/v1/artifacts/:id',request=>artifacts.get(request.query.workspaceId,request.params.id));
 app.get<{Params:{id:ArtifactId};Querystring:{workspaceId:WorkspaceId}}>('/api/v1/artifacts/:id/download',async(request,reply)=>{const file=await artifacts.download(request.query.workspaceId,request.params.id);reply.header('content-disposition','attachment');return sendDocumentFile(reply,file.path,file.mime,request.headers.range);});
 app.post<{Params:{id:ArtifactId};Querystring:{workspaceId:WorkspaceId}}>('/api/v1/artifacts/:id/open',request=>artifacts.open(request.query.workspaceId,request.params.id));
}
