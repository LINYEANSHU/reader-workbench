import type {FastifyInstance} from 'fastify';
import type {Authentication} from '../auth.js';
import type {DocumentProcessingService} from '../../../../packages/core/src/documents/processing.js';
import type {DocumentProcessingRequest} from '../../../../packages/contracts/src/document-processing.js';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import {ReaderError} from '../../../../packages/contracts/src/errors.js';
export function documentProcessingRoutes(app:FastifyInstance,service:DocumentProcessingService,auth:Authentication){
 const prefix='/api/v1/workspaces/:id/document-processing';
 type Route={Params:{id:WorkspaceId;taskId:string};Querystring:{sessionId?:SessionId};Body:{sessionId?:SessionId;name?:string}};
 const session=(request:import('fastify').FastifyRequest<Route>)=>{const id=request.query.sessionId??request.body?.sessionId;if(typeof id!=='string'||!id||id.length>192)throw new ReaderError('SESSION_REQUIRED','请指定任务所属会话');return id;};
 app.get<{Params:{id:WorkspaceId}}>(prefix,request=>service.list(request.params.id,auth.actor(request)));
 app.post<{Params:{id:WorkspaceId};Body:DocumentProcessingRequest}>(prefix,request=>{if(request.body?.document?.workspaceId!==request.params.id)throw new ReaderError('PROCESSING_SCOPE_DENIED','处理请求越过工作区',403);return service.start(request.body,auth.actor(request));});
 app.get<Route>(prefix+'/:taskId',request=>service.get(request.params.id,request.params.taskId,session(request),auth.actor(request)));
 app.post<Route>(prefix+'/:taskId/cancel',request=>service.cancel(request.params.id,request.params.taskId,session(request),auth.actor(request)));
 app.get<Route>(prefix+'/:taskId/preview',async(request,reply)=>{const result=await service.preview(request.params.id,request.params.taskId,session(request),auth.actor(request));return reply.header('cache-control','no-store').header('content-disposition',"inline; filename*=UTF-8''"+encodeURIComponent(result.name)).type(result.mime).send(Buffer.from(result.bytes));});
 app.post<Route>(prefix+'/:taskId/save',request=>service.save(request.params.id,request.params.taskId,session(request),auth.actor(request),request.body?.name));
}
