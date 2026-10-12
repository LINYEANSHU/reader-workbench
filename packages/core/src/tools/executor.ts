import {createHash} from 'node:crypto';
import {Ajv} from 'ajv';import {Ajv2020} from 'ajv/dist/2020.js';
import type {RunScope} from '../../../contracts/src/ids.js';
import type {ToolResult,ToolEffect} from '../../../contracts/src/tools.js';
import type {WorkspaceService} from '../workspaces/service.js';
import type {ToolRegistry} from './registry.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {KeyedQueue} from '../runs/queue.js';
type Execution={status:'started'|'completed'|'failed';name:string;inputHash:string;result?:ToolResult};
export class ToolExecutor{
 private queue=new KeyedQueue();private ajv=new Ajv({strict:false,allErrors:true,removeAdditional:false,coerceTypes:false});
 private ajv2020=new Ajv2020({strict:false,allErrors:true,removeAdditional:false,coerceTypes:false});
 constructor(private tools:ToolRegistry,private workspaces:WorkspaceService){}
 execute(name:string,input:unknown,scope:RunScope,executionId:string,signal:AbortSignal,requiredEffect?:ToolEffect):Promise<ToolResult>{
  if(!executionId.startsWith(scope.runId+':'))return Promise.reject(new ReaderError('TOOL_SCOPE_DENIED','工具执行标识不属于此运行',403));
  return this.queue.enqueue(scope.workspaceId+'/'+executionId,async()=>{
   signal.throwIfAborted();const lease=await this.tools.acquire(name,scope);
   try{
    if(requiredEffect&&lease.definition.effect!==requiredEffect)throw new ReaderError('TOOL_SCOPE_DENIED','此能力仅允许只读工具',403);
    const store=await this.workspaces.storeFor(scope.workspaceId),hash=createHash('sha256').update(JSON.stringify(input)??'null').digest('hex');
    const previous=store.getRecord<Execution>('tool-executions',executionId);
    if(previous){if(previous.status!=='completed')throw new ReaderError('TOOL_EXECUTION_UNCERTAIN','上次工具执行未确认完成，禁止自动重放');if(previous.name!==name||previous.inputHash!==hash)throw new ReaderError('TOOL_EXECUTION_CONFLICT','同一工具调用标识的输入不一致');return structuredClone(previous.result!);}
    let valid=false;try{const dialect=(lease.definition.inputSchema as Record<string,unknown>)?.['$schema'];valid=(dialect==='https://json-schema.org/draft/2020-12/schema'?this.ajv2020:this.ajv).validate(lease.definition.inputSchema as object,input) as boolean;}catch{throw new ReaderError('TOOL_SCHEMA_INVALID','工具输入定义无效');}
    if(!valid)throw new ReaderError('TOOL_INPUT_INVALID','工具参数不符合定义，未执行');
    store.putRecord('tool-executions',executionId,{status:'started',name,inputHash:hash});
    try{
     const result=await lease.definition.execute(structuredClone(input),structuredClone(scope),signal);signal.throwIfAborted();
     if(!result||typeof result.content!=='string'||result.sourceAnchors?.some(anchor=>anchor.workspaceId!==scope.workspaceId)||result.pageImages?.some(anchor=>anchor.workspaceId!==scope.workspaceId||anchor.location?.kind!=='page'||!Number.isSafeInteger(anchor.location.page)||anchor.location.page<1))throw new ReaderError('TOOL_RESULT_INVALID','工具返回内容或来源无效');
     if(Buffer.byteLength(JSON.stringify(result))>4*1024*1024)throw new ReaderError('TOOL_RESULT_LIMIT','工具返回内容过大');
     store.putRecord('tool-executions',executionId,{status:'completed',name,inputHash:hash,result});return result;
    }catch(error){store.putRecord('tool-executions',executionId,{status:'failed',name,inputHash:hash});throw error;}
   }finally{lease.release();}
  });
 }
}

