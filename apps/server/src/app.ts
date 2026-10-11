import Fastify from 'fastify';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RuntimeConfig } from '../../../packages/contracts/src/runtime.js';
import { ReaderError,publicError } from '../../../packages/contracts/src/errors.js';
import { writePrivateJson } from '../../../packages/core/src/runtime/secure-file.js';
import { doctor } from '../../../packages/core/src/runtime/doctor.js';
import { Authentication } from './auth.js';
import {WorkspaceService} from '../../../packages/core/src/workspaces/service.js';
import {workspaceRoutes} from './routes/workspaces.js';
import {uiStateRoutes} from './routes/ui-state.js';
import {CapabilityRegistry} from '../../../packages/core/src/plugins/registry.js';
import {PluginManager} from '../../../packages/core/src/plugins/manager.js';
import {DocumentService} from '../../../packages/core/src/documents/service.js';
import {documentRoutes} from './routes/documents.js';
import {SessionRepository} from '../../../packages/core/src/sessions/repository.js';
import {SessionService} from '../../../packages/core/src/sessions/service.js';
import {ContextBuilder} from '../../../packages/core/src/sessions/context.js';
import {sessionRoutes} from './routes/sessions.js';
import {ToolRegistry} from '../../../packages/core/src/tools/registry.js';
import {RunService} from '../../../packages/core/src/runs/service.js';
import {runRoutes} from './routes/runs.js';
import {ModelSettingsService} from '../../../packages/core/src/models/settings.js';
import {demoProvider} from '../../../packages/core/src/models/demo.js';
import {settingsRoutes} from './routes/settings.js';
export async function startServer(config:RuntimeConfig){
  const app=Fastify({logger:false,bodyLimit:16*1024*1024,forceCloseConnections:true});
  const auth=new Authentication();
  auth.url='http://'+(config.host.includes(':')?'['+config.host+']':config.host)+':'+config.port;
  auth.attach(app);
  const workspaces=new WorkspaceService(config.configDir);
  const capabilities=new CapabilityRegistry();
  const models=new ModelSettingsService(workspaces,capabilities);if(config.demo)capabilities.register('*','model','demo',demoProvider);
  const documents=new DocumentService(workspaces,capabilities);
  const plugins=new PluginManager(capabilities,workspaces);
  const sessionRepository=new SessionRepository(workspaces);
  const sessions=new SessionService(sessionRepository);
  const context=new ContextBuilder(sessionRepository,documents,capabilities);
  const tools=new ToolRegistry(capabilities,scope=>sessionRepository.authorizeScope(scope));
  const runs=new RunService({workspaces,repository:sessionRepository,context,tools,documents,capabilities});
  workspaceRoutes(app,workspaces,auth);uiStateRoutes(app,workspaces);
  documentRoutes(app,documents);
  sessionRoutes(app,sessions,auth);
  runRoutes(app,runs,auth);
  settingsRoutes(app,models);
  app.addHook('preClose',async()=>{await runs.close();await documents.close();});
  app.addHook('onClose',async()=>{await workspaces.close();});
  app.setErrorHandler((error,_request,reply)=>{
    const status=error instanceof ReaderError?error.status:(error as {statusCode?:number}).statusCode??500;
    const exposed=error instanceof ReaderError?error.public():status===400?{code:'INVALID_REQUEST',message:'请求参数或 JSON 格式无效',retryable:false}:status===413?{code:'PAYLOAD_TOO_LARGE',message:'请求内容超过大小限制',retryable:false}:publicError(error);
    reply.code(status).send({error:exposed});
  });
  app.get('/health',async()=>({status:'ok'}));
  app.get('/api/v1/config',async()=>({host:config.host,port:Number(new URL(auth.url).port),demo:config.demo,workspace:config.workspace??null}));
  app.get('/api/v1/doctor',async()=>doctor(config));
  app.get('/',async(_request,reply)=>{
    const nonce=randomBytes(16).toString('base64');
    reply.header('content-security-policy',"default-src 'self'; script-src 'nonce-"+nonce+"'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'");
    return reply.type('text/html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Reader Workbench</title><body><h1>Reader Workbench</h1><p id="status">请选择工作区。文档阅读界面正在接入。</p><script nonce="${nonce}">const code=new URLSearchParams(location.hash.slice(1)).get('bootstrap');history.replaceState(null,'','/');if(code)fetch('/api/v1/auth/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})}).then(r=>{if(!r.ok)document.getElementById('status').textContent='启动链接已失效，请重新连接';});</script></body></html>`);
  });
  try{
    const url=await app.listen({host:config.host,port:config.port});auth.url=url;
    await writePrivateJson(join(config.configDir,'connection.json'),{url,token:auth.token,pid:process.pid});
    if(config.workspace)await workspaces.select(config.workspace,{callerId:'local-owner',transport:'internal'});
    await models.loadRecent();
    return {url,bootstrapUrl:url+'/#bootstrap='+auth.code,app,auth,workspaces,documents,capabilities,plugins,sessionRepository,sessions,context,runs,tools,models,close:async()=>{await app.close();}};
  }catch(error){await app.close();if((error as NodeJS.ErrnoException).code==='EADDRINUSE')throw new ReaderError('PORT_IN_USE','端口 '+config.port+' 已被占用，请使用 --port 指定其他端口');throw error;}
}
