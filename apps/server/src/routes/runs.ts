import type {FastifyInstance} from 'fastify';
import type {RunService} from '../../../../packages/core/src/runs/service.js';
import type {AskRequest} from '../../../../packages/contracts/src/sessions.js';
import type {RunId,WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import {ReaderError} from '../../../../packages/contracts/src/errors.js';
import type {Authentication} from '../auth.js';
import {askRequestSchema as ask} from '../../../../packages/contracts/src/validation.js';
interface Params{id:RunId}interface Query{workspaceId:WorkspaceId;afterSeq?:string}
export function runRoutes(app:FastifyInstance,runs:RunService,auth:Authentication){
 const workspace=(query:Query)=>{if(!query.workspaceId)throw new ReaderError('WORKSPACE_REQUIRED','运行接口需要 workspaceId');return query.workspaceId;};
 app.post('/api/v1/runs',async(request,reply)=>{const parsed=ask.safeParse(request.body);if(!parsed.success)throw new ReaderError('INVALID_REQUEST','提问参数无效');const result=await runs.submit(parsed.data as AskRequest,auth.actor(request));return reply.code(202).send(result);});
 app.get<{Params:Params;Querystring:Query}>('/api/v1/runs/:id',request=>runs.get(workspace(request.query),request.params.id));
 app.post<{Params:Params;Body:Query}>('/api/v1/runs/:id/cancel',async request=>{await runs.cancel(workspace(request.body??{} as Query),request.params.id,auth.actor(request));return{cancelled:true};});
 app.get<{Params:Params;Querystring:Query}>('/api/v1/runs/:id/events',async(request,reply)=>{
  const workspaceId=workspace(request.query),after=Number(request.query.afterSeq??request.headers['last-event-id']??0);
  if(!Number.isSafeInteger(after)||after<0)throw new ReaderError('INVALID_CURSOR','事件序号无效');await runs.get(workspaceId,request.params.id);
  const controller=new AbortController();reply.raw.on('close',()=>controller.abort());reply.hijack();reply.raw.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});reply.raw.flushHeaders();
  const heartbeat=setInterval(()=>{if(!controller.signal.aborted)reply.raw.write(': heartbeat\n\n');},10000);
  try{for await(const event of runs.events(workspaceId,request.params.id,after,controller.signal)){if(controller.signal.aborted)break;reply.raw.write('id: '+event.seq+'\nevent: '+event.kind+'\ndata: '+JSON.stringify(event)+'\n\n');}}
  finally{clearInterval(heartbeat);if(!reply.raw.destroyed)reply.raw.end();}
 });
}

