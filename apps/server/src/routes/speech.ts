import type {FastifyInstance,FastifyRequest} from 'fastify';import {z} from 'zod';import type {Authentication} from '../auth.js';import type {SpeechService} from '../../../../packages/core/src/speech/service.js';import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';import {ReaderError} from '../../../../packages/contracts/src/errors.js';
interface Parameters{id:WorkspaceId;sessionId:SessionId;jobId:string}
const requestSchema=z.object({requestId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),providerId:z.string().min(1).max(200)}).strict();
export function speechRoutes(app:FastifyInstance,speech:SpeechService,auth:Authentication){
 const prefix='/api/v1/workspaces/:id/sessions/:sessionId/speech',scope=(request:FastifyRequest<{Params:Parameters}>)=>({actor:auth.actor(request),workspaceId:request.params.id,sessionId:request.params.sessionId});
 app.get<{Params:Parameters}>(prefix+'/catalog',request=>speech.catalog(scope(request)));
 app.post<{Params:Parameters}>(prefix+'/prepare',async request=>{const parsed=requestSchema.safeParse(request.body);if(!parsed.success)throw new ReaderError('SPEECH_REQUEST_INVALID','语音准备参数无效');return speech.prepare(scope(request),parsed.data);});
 app.post<{Params:Parameters}>(prefix+'/transcribe',async request=>{const parsed=requestSchema.extend({language:z.string().max(10),audioBase64:z.string().max(5592410)}).strict().safeParse(request.body);if(!parsed.success||!parsed.data.audioBase64||!/^[A-Za-z0-9+/]*={0,2}$/.test(parsed.data.audioBase64)||parsed.data.audioBase64.length%4!==0)throw new ReaderError('SPEECH_AUDIO_INVALID','录音编码、大小或语音请求无效');return speech.transcribe(scope(request),{...parsed.data,audio:Buffer.from(parsed.data.audioBase64,'base64')});});
 app.get<{Params:Parameters}>(prefix+'/jobs/:jobId',request=>speech.get(scope(request),request.params.jobId));
 app.post<{Params:Parameters}>(prefix+'/jobs/:jobId/cancel',request=>speech.cancel(scope(request),request.params.jobId));
}
