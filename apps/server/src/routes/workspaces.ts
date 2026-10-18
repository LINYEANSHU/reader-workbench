import type {FastifyInstance} from 'fastify';
import type {WorkspaceService} from '../../../../packages/core/src/workspaces/service.js';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import {ReaderError} from '../../../../packages/contracts/src/errors.js';
import type {Authentication} from '../auth.js';
export function workspaceRoutes(app:FastifyInstance,service:WorkspaceService,auth:Authentication){
  app.get('/api/v1/workspaces',request=>service.listRecent(auth.actor(request)));
  app.post('/api/v1/workspaces',request=>{const root=(request.body as {root?:unknown})?.root;if(typeof root!=='string'||!root)throw new ReaderError('INVALID_ARGUMENT','请选择工作区路径');return service.select(root,auth.actor(request));});
  app.get<{Querystring:{path?:string;workspaceId?:WorkspaceId}}>('/api/v1/directories',request=>service.browseDirectories(request.query.path??'',auth.actor(request),request.query.workspaceId));
  app.get<{Querystring:{path?:string;workspaceId?:WorkspaceId}}>('/api/v1/directories/browser',request=>service.browseDirectoryBrowser(request.query.path??'',auth.actor(request),request.query.workspaceId));
  app.get<{Params:{id:WorkspaceId};Querystring:{path?:string}}>('/api/v1/workspaces/:id/files',request=>service.listFiles(request.params.id,request.query.path??''));
}
