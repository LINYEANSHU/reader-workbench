import {McpServer} from '@modelcontextprotocol/server';import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';import {NodeStreamableHTTPServerTransport} from '@modelcontextprotocol/node';import Fastify from 'fastify';import {z} from 'zod';import {setTimeout as delay} from 'node:timers/promises';
let revision=1,cancelled=false;
function createFixture(){
 const server=new McpServer({name:'reader-external-fixture',version:'1'}),schema=()=>revision===1?z.object({term:z.string()}):z.object({term:z.string(),revision:z.number()});
 const lookup=server.registerTool('lookup',{inputSchema:schema()},async input=>({content:[{type:'text',text:'lookup '+input.term}],structuredContent:{term:input.term}}));
 server.registerTool('write_external',{inputSchema:z.object({})},async()=>({content:[{type:'text',text:'external effect'}]}));
 server.registerTool('parent_mutation',{inputSchema:z.object({url:z.string(),workspaceId:z.string(),parentSessionId:z.string()})},async input=>{const result=await fetch(input.url+'/api/v1/workspaces/'+input.workspaceId+'/sessions/'+input.parentSessionId+'/clear',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return{content:[{type:'text',text:'parent attempt '+result.status}],structuredContent:{parentAttemptStatus:result.status}};});
 server.registerTool('rotate_schema',{inputSchema:z.object({})},async()=>{revision=2;lookup.update({paramsSchema:schema()});return{content:[{type:'text',text:'schema updated'}]};});
 server.registerTool('long_call',{inputSchema:z.object({})},async(_input,ctx)=>{cancelled=false;try{await delay(30000,undefined,{signal:ctx.mcpReq.signal});return{content:[{type:'text',text:'done'}]};}finally{cancelled=ctx.mcpReq.signal.aborted;}});
 server.registerTool('status',{inputSchema:z.object({})},async()=>({content:[{type:'text',text:JSON.stringify({cancelled})}],structuredContent:{cancelled}}));return server;
}
if(process.argv.includes('--http')){
 const app=Fastify({logger:false,forceCloseConnections:true}),active=new Set();app.post('/mcp',async(request,reply)=>{const server=createFixture(),transport=new NodeStreamableHTTPServerTransport({sessionIdGenerator:undefined});active.add(server);await server.connect(transport);reply.hijack();reply.raw.once('close',()=>{active.delete(server);void server.close();});await transport.handleRequest(request.raw,reply.raw,request.body);});app.addHook('preClose',async()=>{await Promise.allSettled([...active].map(server=>server.close()));});
 const url=await app.listen({host:'127.0.0.1',port:0});process.stdout.write(JSON.stringify({url:url+'/mcp'})+'\n');const stop=async()=>{await app.close();process.exit(0);};process.once('SIGINT',stop);process.once('SIGTERM',stop);process.stdin.once('end',()=>void stop());process.stdin.resume();
}else{const server=createFixture();await server.connect(new StdioServerTransport());process.stdin.once('end',()=>void server.close());}
