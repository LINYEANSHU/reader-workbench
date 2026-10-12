import type {ToolProvider} from '../../../sdk/src/capabilities.js';
import type {DocumentMemoryConsumer} from '../documents/memory-consumer.js';
import type {RunRepository} from '../runs/repository.js';
import type {RunScope} from '../../../contracts/src/ids.js';
import type {DocumentRef} from '../../../contracts/src/documents.js';
import {ReaderError} from '../../../contracts/src/errors.js';
export function documentMemoryTools(memory:DocumentMemoryConsumer,runs:RunRepository):ToolProvider{
 const schema={type:'object',properties:{documentId:{type:'string'},version:{type:'string'},page:{type:'integer',minimum:1}},required:['documentId','version','page'],additionalProperties:false};
 const read=async(input:unknown,scope:RunScope)=>{
  const value=input as DocumentRef&{page:number},run=await runs.get(scope.workspaceId,scope.runId);
  const reference=run.context?.documentMemories?.find(item=>item.document.documentId===value.documentId&&item.document.version===value.version&&item.document.workspaceId===scope.workspaceId);
  if(!reference)throw new ReaderError('TOOL_SCOPE_DENIED','此文档没有本次运行授权的阅读记忆',403);
  const record=await memory.store.load(reference.document,reference.cacheKey,reference.generation);
  const page=record?.pages.find(item=>item.page===value.page);
  if(!page)throw new ReaderError('DOCUMENT_PAGE_INVALID','文档记忆页码不可用');
  return{content:JSON.stringify(page),sourceAnchors:[{...reference.document,location:{kind:'page' as const,page:value.page}}]};
 };
 return{tools:[{name:'read_document_memory',description:'读取本次文档记忆的完整指定页，适用于上下文中未包含的页',effect:'read',inputSchema:schema,execute:read},{name:'revisit_document_page',description:'需要核实图表或记忆遗漏时，重新查看指定一页图像；不重发整份文档',effect:'read',inputSchema:schema,execute:async(input,scope)=>{const result=await read(input,scope);return{...result,pageImages:result.sourceAnchors};}}]};
}
