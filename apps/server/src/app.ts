import Fastify from 'fastify';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RuntimeConfig } from '../../../packages/contracts/src/runtime.js';
import { ReaderError,publicError } from '../../../packages/contracts/src/errors.js';
import { writePrivateJson } from '../../../packages/core/src/runtime/secure-file.js';
import { doctor } from '../../../packages/core/src/runtime/doctor.js';
import { Authentication } from './auth.js';
export async function startServer(config:RuntimeConfig){
  const app=Fastify({logger:false,bodyLimit:16*1024*1024});
  const auth=new Authentication();
  auth.url='http://'+(config.host.includes(':')?'['+config.host+']':config.host)+':'+config.port;
  auth.attach(app);
  app.setErrorHandler((error,_request,reply)=>{
    reply.code(error instanceof ReaderError?error.status:(error as {statusCode?:number}).statusCode??500).send({error:publicError(error)});
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
    return {url,bootstrapUrl:url+'/#bootstrap='+auth.code,app,auth,close:async()=>{await app.close();}};
  }catch(error){await app.close();if((error as NodeJS.ErrnoException).code==='EADDRINUSE')throw new ReaderError('PORT_IN_USE','端口 '+config.port+' 已被占用，请使用 --port 指定其他端口');throw error;}
}
