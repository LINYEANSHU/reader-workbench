import type {ToolProvider} from '../../../sdk/src/capabilities.js';
import type {DocumentService} from '../documents/service.js';
import type {SessionRepository} from '../sessions/repository.js';
import type {DocumentRef} from '../../../contracts/src/documents.js';
import type {SessionId} from '../../../contracts/src/ids.js';
import {HistorySearch} from '../sessions/history-search.js';
export function builtinTools(documents:DocumentService,repository:SessionRepository):ToolProvider{
 const history=new HistorySearch(repository),properties={documentId:{type:'string'},version:{type:'string'}};
 const schema=(extra:object,required:string[])=>({type:'object',properties:{...properties,...extra},required:['documentId','version',...required],additionalProperties:false});
 return{tools:[
  {name:'read_document_page',description:'读取指定版本的文档页文字及来源，不读取任意路径',effect:'read',inputSchema:schema({page:{type:'integer',minimum:1}},['page']),execute:async(input,scope,signal)=>{signal.throwIfAborted();const value=input as DocumentRef&{page:number},ref={workspaceId:scope.workspaceId,documentId:value.documentId,version:value.version};await documents.waitReady(ref,signal);const page=await documents.readPage(ref,value.page);return{content:page.text,sourceAnchors:page.anchors};}},
  {name:'read_document_block',effect:'read',inputSchema:schema({blockId:{type:'string'}},['blockId']),execute:async(input,scope,signal)=>{const value=input as DocumentRef&{blockId:string},ref={workspaceId:scope.workspaceId,documentId:value.documentId,version:value.version};await documents.waitReady(ref,signal);const block=await documents.readBlock(ref,value.blockId);return{content:block.text,sourceAnchors:[block.anchor]};}},
  {name:'search_document',effect:'read',inputSchema:schema({query:{type:'string',maxLength:1000}},['query']),execute:async(input,scope,signal)=>{const value=input as DocumentRef&{query:string},ref={workspaceId:scope.workspaceId,documentId:value.documentId,version:value.version};await documents.waitReady(ref,signal);const hits=await documents.search(ref,value.query,10);return{content:JSON.stringify(hits),sourceAnchors:hits.map(hit=>hit.anchor)};}},
  {name:'read_history',description:'读取当前会话或临时会话的父主对话归档',effect:'read',inputSchema:{type:'object',properties:{sessionId:{type:'string'},cursor:{type:'string'}},additionalProperties:false},execute:async(input,scope)=>{const value=input as {sessionId?:SessionId;cursor?:string};return{content:JSON.stringify(await history.read(scope,value.sessionId??scope.sessionId,value.cursor))};}},
  {name:'search_history',effect:'read',inputSchema:{type:'object',properties:{sessionId:{type:'string'},query:{type:'string',maxLength:1000}},required:['query'],additionalProperties:false},execute:async(input,scope)=>{const value=input as {sessionId?:SessionId;query:string};return{content:JSON.stringify(await history.search(scope,value.sessionId??scope.sessionId,value.query))};}}
 ]};
}
