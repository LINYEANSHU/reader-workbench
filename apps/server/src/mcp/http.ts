import {NodeStreamableHTTPServerTransport} from '@modelcontextprotocol/node';
import {localhostHostValidation} from '@modelcontextprotocol/fastify';
import type {FastifyInstance} from 'fastify';
import type {Authentication} from '../auth.js';
import {createMcpServer,type ReaderServices} from './server.js';
export async function attachMcpHttp(app:FastifyInstance,services:ReaderServices,auth:Authentication){
 const active=new Set<ReturnType<typeof createMcpServer>>();
 app.route({method:['POST','GET','DELETE'],url:'/mcp',preHandler:localhostHostValidation(),handler:async(request,reply)=>{
  if(request.method!=='POST')return reply.code(405).header('allow','POST').send({jsonrpc:'2.0',error:{code:-32000,message:'Method not allowed'},id:null});
  const server=createMcpServer(services,{...auth.actor(request),transport:'mcp'}),transport=new NodeStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});active.add(server);
  await server.connect(transport);reply.hijack();
  const close=()=>{active.delete(server);void server.close();};reply.raw.once('close',close);
  try{await transport.handleRequest(request.raw,reply.raw,request.body);}catch{close();if(!reply.raw.headersSent)reply.raw.writeHead(500,{'content-type':'application/json'});if(!reply.raw.writableEnded)reply.raw.end(JSON.stringify({jsonrpc:'2.0',error:{code:-32603,message:'Reader MCP request failed'},id:null}));}
 }});
 app.addHook('preClose',async()=>{await Promise.allSettled([...active].map(server=>server.close()));active.clear();});
}
