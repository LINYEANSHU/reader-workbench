import type {FastifyInstance} from 'fastify';
import type {SessionService} from '../../../../packages/core/src/sessions/service.js';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import {ReaderError} from '../../../../packages/contracts/src/errors.js';
import type {Authentication} from '../auth.js';
interface SessionParams {id:WorkspaceId;sessionId:SessionId}
export function sessionRoutes(app:FastifyInstance,sessions:SessionService,auth:Authentication){
  const prefix='/api/v1/workspaces/:id/sessions';
  app.get<{Params:{id:WorkspaceId}}>(prefix,request=>sessions.list(request.params.id));
  app.post<{Params:{id:WorkspaceId};Body:{title?:string}}>(prefix,request=>{
    const title=request.body?.title??'阅读会话';
    if(typeof title!=='string')throw new ReaderError('INVALID_ARGUMENT','标题必须是文字');
    return sessions.createMain(request.params.id,title);
  });
  app.get<{Params:SessionParams}>(prefix+'/:sessionId',request=>sessions.get(request.params.id,request.params.sessionId));
  app.put<{Params:SessionParams;Body:{archived:boolean}}>(prefix+'/:sessionId/archive',request=>{
    if(typeof request.body?.archived!=='boolean')throw new ReaderError('INVALID_ARGUMENT','archived 必须为布尔值');
    return sessions.setArchived(request.params.id,request.params.sessionId,request.body.archived,auth.actor(request));
  });
  app.get<{Params:SessionParams;Querystring:{cursor?:string}}>(prefix+'/:sessionId/history',request=>sessions.getHistory(request.params.id,request.params.sessionId,request.query.cursor));
  app.post<{Params:SessionParams}>(prefix+'/:sessionId/temporary',request=>sessions.createTemporary(request.params.id,request.params.sessionId));
  app.post<{Params:SessionParams}>(prefix+'/:sessionId/clear',async request=>{
    await sessions.clearTemporary(request.params.id,request.params.sessionId,auth.actor(request));return {cleared:true};
  });
}
