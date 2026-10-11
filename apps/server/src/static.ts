import type {FastifyInstance} from 'fastify';import fastifyStatic from '@fastify/static';import {join} from 'node:path';import {access} from 'node:fs/promises';import {packageRoot} from '../../../packages/core/src/runtime/resources.js';
export async function serveWeb(app:FastifyInstance){
 const root=join(await packageRoot(),'apps','web','dist');try{await access(join(root,'index.html'));}catch{return false;}
 app.addHook('onSend',async(request,reply,payload)=>{if(!request.url.startsWith('/api/')&&!request.url.startsWith('/mcp'))reply.header('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'").header('x-content-type-options','nosniff');return payload;});
 await app.register(fastifyStatic,{root,prefix:'/',index:'index.html',maxAge:'1h'});return true;
}
