import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Authentication} from './auth.js';
import {readerOperations,invokeReaderOperation,type ReaderServices} from './mcp/server.js';
export function attachReaderOpenApi(app:FastifyInstance,services:ReaderServices,auth:Authentication){
 const paths=Object.fromEntries(Object.entries(readerOperations).map(([name,operation])=>['/api/v1/agent-tools/'+name,{post:{operationId:name,description:operation.description,requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(operation.schema,{target:'draft-2020-12'})}}},responses:{'200':{description:'Result from the same Reader service'},'400':{description:'Invalid request'},'401':{description:'Authentication required'},'403':{description:'Ownership denied'}},security:[{bearerAuth:[]}]}}]));
 app.get('/api/v1/openapi.json',async()=>({openapi:'3.1.0',info:{title:'Reader Workbench Agent API',version:'0.1.0'},paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}}}));
 app.post<{Params:{name:string}}>('/api/v1/agent-tools/:name',request=>invokeReaderOperation(services,auth.actor(request),request.params.name,request.body,new AbortController().signal));
}
