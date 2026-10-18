import type {ToolProvider} from '../../../sdk/src/capabilities.js';
import type {DocumentMemoryConsumer} from '../documents/memory-consumer.js';
import type {RunRepository} from '../runs/repository.js';
import type {RunScope} from '../../../contracts/src/ids.js';
import type {DocumentRef} from '../../../contracts/src/documents.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {searchMemoryEntries,type DocumentMemoryEntryKind} from '../../../contracts/src/document-memory.js';
import {readingMode} from '../../../contracts/src/reading-plan.js';
export function documentMemoryTools(memory:DocumentMemoryConsumer,runs:RunRepository):ToolProvider{
 const schema={type:'object',properties:{documentId:{type:'string'},version:{type:'string'},page:{type:'integer',minimum:1}},required:['documentId','version','page'],additionalProperties:false};
 const read=async(input:unknown,scope:RunScope)=>{
  const value=input as DocumentRef&{page:number},run=await runs.get(scope.workspaceId,scope.runId);
  const reference=run.context?.documentMemories?.find(item=>item.document.documentId===value.documentId&&item.document.version===value.version&&item.document.workspaceId===scope.workspaceId);
  if(!reference)throw new ReaderError('TOOL_SCOPE_DENIED','此文档没有本次运行授权的阅读记忆',403);
  if(!reference.completedPages.includes(value.page))throw new ReaderError('TOOL_SCOPE_DENIED','页码不属于本次授权的已读范围',403);
  const record=await memory.store.load(reference.document,reference.cacheKey,reference.generation);
  const page=record?.pages.find(item=>item.page===value.page);
  if(!page)throw new ReaderError('DOCUMENT_PAGE_INVALID','文档记忆页码不可用');
  return{content:JSON.stringify(page),sourceAnchors:[{...reference.document,location:{kind:'page' as const,page:value.page}}]};
 };
 return{tools:[{name:'search_document_memory',description:'按公式编号、中文描述、图表或术语检索本次授权的已读记忆；返回真实来源与定位精度，未读页没有记忆',effect:'read',inputSchema:{type:'object',properties:{documentId:{type:'string'},version:{type:'string'},query:{type:'string',maxLength:1000},kind:{type:'string',enum:['formula','figure','term']}},required:['documentId','version','query'],additionalProperties:false},execute:async(input,scope)=>{const value=input as {documentId:string;version:string;query:string;kind?:DocumentMemoryEntryKind},run=await runs.get(scope.workspaceId,scope.runId),reference=run.context?.documentMemories?.find(item=>item.document.documentId===value.documentId&&item.document.version===value.version&&item.document.workspaceId===scope.workspaceId);if(!reference)throw new ReaderError('TOOL_SCOPE_DENIED','此文档没有本次运行授权的阅读记忆',403);const record=await memory.store.load(reference.document,reference.cacheKey,reference.generation),completedPages=reference.completedPages.filter(page=>record?.completedPages.includes(page)),entries=record?searchMemoryEntries({...record,completedPages,pages:record.pages.filter(page=>completedPages.includes(page.page))},value.query,value.kind):[];return{content:JSON.stringify({entries,completedPages,pageCount:reference.pageCount}),sourceAnchors:entries.map(item=>item.anchor)};}},{name:'read_document_memory',description:'读取本次文档记忆的完整指定页，适用于上下文中未包含的页',effect:'read',inputSchema:schema,execute:read},{name:'revisit_document_page',description:'需要核实图表或记忆遗漏时，重新查看指定一页图像；不重发整份文档',effect:'read',inputSchema:schema,execute:async(input,scope)=>{const result=await read(input,scope),document=await memory.documents.get(result.sourceAnchors[0]!);return readingMode(document)==='text'?result:{...result,pageImages:result.sourceAnchors};}}]};
}
