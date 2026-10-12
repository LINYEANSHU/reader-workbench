import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Authentication} from './auth.js';
import {readerOperations,invokeReaderOperation,type ReaderServices} from './mcp/server.js';
export function attachReaderOpenApi(app:FastifyInstance,services:ReaderServices,auth:Authentication){
 const paths:Record<string,unknown>=Object.fromEntries(Object.entries(readerOperations).map(([name,operation])=>['/api/v1/agent-tools/'+name,{post:{operationId:name,description:operation.description,requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(operation.schema,{target:'draft-2020-12'})}}},responses:{'200':{description:'Result from the same Reader service'},'400':{description:'Invalid request'},'401':{description:'Authentication required'},'403':{description:'Ownership denied'}},security:[{bearerAuth:[]}]}}]));
 const memory='/api/v1/workspaces/{id}/documents/{documentId}/{version}/memory',parameters=['id','documentId','version'].map(name=>({name,in:'path',required:true,schema:{type:'string'}})),query={name:'providerId',in:'query',required:true,schema:{type:'string'}},responses={'200':{description:'Local document memory'},'400':{description:'Invalid model or page'},'403':{description:'Workspace ownership denied'},'404':{description:'Document version or page memory unavailable'}};
 paths[memory]={get:{operationId:'document_memory_status',parameters:[...parameters,query],responses,security:[{bearerAuth:[]}]}};
 paths[memory+'/pages/{page}']={get:{operationId:'document_memory_page',parameters:[...parameters,{name:'page',in:'path',required:true,schema:{type:'integer',minimum:1}},query],responses,security:[{bearerAuth:[]}]}};
 paths[memory+'/rebuild']={post:{operationId:'rebuild_document_memory',parameters,requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{providerId:{type:'string'}},required:['providerId']}}}},responses,security:[{bearerAuth:[]}]}};
 app.get('/api/v1/openapi.json',async()=>({openapi:'3.1.0',info:{title:'Reader Workbench Agent API',version:'0.2.0'},paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}}}));
 app.post<{Params:{name:string}}>('/api/v1/agent-tools/:name',request=>invokeReaderOperation(services,auth.actor(request),request.params.name,request.body,new AbortController().signal));
}
