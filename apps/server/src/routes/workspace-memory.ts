import type {FastifyInstance} from 'fastify';
import type {WorkspaceMemoryService} from '../../../../packages/core/src/knowledge/service.js';
import type {WorkspaceService} from '../../../../packages/core/src/workspaces/service.js';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import {ReaderError} from '../../../../packages/contracts/src/errors.js';
import type {Authentication} from '../auth.js';
export function workspaceMemoryRoutes(app:FastifyInstance,memory:WorkspaceMemoryService,workspaces:WorkspaceService,auth:Authentication){
 type Route={Params:{id:WorkspaceId};Body:{enabled?:unknown};Querystring:{query?:string}};
 const prefix='/api/v1/workspaces/:id/memory';
 const authorize=async(request:import('fastify').FastifyRequest<Route>)=>{if(!(await workspaces.listRecent(auth.actor(request))).some(workspace=>workspace.id===request.params.id))throw new ReaderError('WORKSPACE_DENIED','工作区不属于此调用者',403);return request.params.id;};
 app.get<Route>(prefix,async request=>{const id=await authorize(request);memory.schedule(id);return memory.status(id);});
 app.put<Route>(prefix,async request=>{const id=await authorize(request);if(!request.body||Object.keys(request.body).some(key=>key!=='enabled')||typeof request.body.enabled!=='boolean')throw new ReaderError('INVALID_MEMORY_SETTINGS','请提供 enabled 开关');await memory.configure({enabled:request.body.enabled});if(request.body.enabled)memory.schedule(id);return memory.status(id);});
 app.post<Route>(prefix+'/sync',async(request,reply)=>{const id=await authorize(request);memory.schedule(id,true);return reply.code(202).send(await memory.status(id));});
 app.get<Route>(prefix+'/search',async request=>{const id=await authorize(request),query=request.query.query;if(typeof query!=='string'||query.length>1000||!query.trim())throw new ReaderError('INVALID_MEMORY_QUERY','请输入 1–1000 字的检索内容');return{items:await memory.search(id,query,new AbortController().signal)};});
}
