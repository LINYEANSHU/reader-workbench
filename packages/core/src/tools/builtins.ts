import type {ToolProvider} from '../../../sdk/src/capabilities.js';
import type {DocumentService} from '../documents/service.js';
import type {SessionRepository} from '../sessions/repository.js';
import type {DocumentRef,SourceAnchor} from '../../../contracts/src/documents.js';
import type {SessionId,RunScope} from '../../../contracts/src/ids.js';
import type {RunRepository} from '../runs/repository.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {HistorySearch} from '../sessions/history-search.js';
export function builtinTools(documents:DocumentService,repository:SessionRepository,runs?:Pick<RunRepository,'get'>):ToolProvider{
 const history=new HistorySearch(repository),properties={documentId:{type:'string'},version:{type:'string'}};
 const schema=(extra:object,required:string[])=>({type:'object',properties:{...properties,...extra},required:['documentId','version',...required],additionalProperties:false});
 const deny=():never=>{throw new ReaderError('TOOL_SCOPE_DENIED','该来源不在本次阅读范围；请先在文档中补读相应页面',403);};
 const allowedPages=async(ref:DocumentRef,scope:RunScope)=>{
  if(!runs)return undefined;
  const record=await runs.get(scope.workspaceId,scope.runId),matches=(value:DocumentRef)=>value.workspaceId===ref.workspaceId&&value.documentId===ref.documentId&&value.version===ref.version;
  if(record.sessionId!==scope.sessionId||record.callerId!==scope.actor.callerId||!record.context||record.request.selection||!record.context.documents.some(matches))return deny();
  // Read scopes pinned by the host for this run are authoritative; they include sources the host added from workspace memory.
  if(record.context.documentReadScopes){const pinned=record.context.documentReadScopes.find(item=>matches(item.document));return pinned?new Set(pinned.pages):deny();}
  if(!record.request.documents.some(matches))return deny();
  const memory=record.context.documentMemories?.find(item=>matches(item.document));
  return memory?new Set(memory.completedPages):undefined;
 };
 const allowedAnchor=async(ref:DocumentRef,anchor:SourceAnchor,pages:Set<number>|undefined)=>{
  if(!pages)return true;
  if(anchor.location.kind==='page')return pages.has(anchor.location.page);
  const blockId=anchor.location.blockId,parsed=await documents.parsed(ref);
  return parsed.pages.some(page=>pages.has(page.page)&&page.anchors.some(item=>item.location.kind==='block'&&item.location.blockId===blockId))||parsed.pages.length===1&&pages.has(1)&&parsed.blocks.some(block=>block.id===blockId);
 };
 return{tools:[
  {name:'read_document_page',description:'读取本次阅读范围内指定版本的页文字及来源；其他页需先补读',effect:'read',inputSchema:schema({page:{type:'integer',minimum:1}},['page']),execute:async(input,scope,signal)=>{signal.throwIfAborted();const value=input as DocumentRef&{page:number},ref={workspaceId:scope.workspaceId,documentId:value.documentId,version:value.version},pages=await allowedPages(ref,scope);if(pages&&!pages.has(value.page))deny();await documents.waitReady(ref,signal);const page=await documents.readPage(ref,value.page);return{content:page.text,sourceAnchors:page.anchors};}},
  {name:'read_document_block',effect:'read',inputSchema:schema({blockId:{type:'string'}},['blockId']),execute:async(input,scope,signal)=>{const value=input as DocumentRef&{blockId:string},ref={workspaceId:scope.workspaceId,documentId:value.documentId,version:value.version},pages=await allowedPages(ref,scope);await documents.waitReady(ref,signal);const block=await documents.readBlock(ref,value.blockId);if(!await allowedAnchor(ref,block.anchor,pages))deny();return{content:block.text,sourceAnchors:[block.anchor]};}},
  {name:'search_document',effect:'read',inputSchema:schema({query:{type:'string',maxLength:1000}},['query']),execute:async(input,scope,signal)=>{const value=input as DocumentRef&{query:string},ref={workspaceId:scope.workspaceId,documentId:value.documentId,version:value.version},pages=await allowedPages(ref,scope);await documents.waitReady(ref,signal);const hits=await documents.search(ref,value.query,10,pages?[...pages]:undefined);return{content:JSON.stringify(hits),sourceAnchors:hits.map(hit=>hit.anchor)};}},
  {name:'read_history',description:'读取当前会话或临时会话的父主对话归档',effect:'read',inputSchema:{type:'object',properties:{sessionId:{type:'string'},cursor:{type:'string'}},additionalProperties:false},execute:async(input,scope)=>{const value=input as {sessionId?:SessionId;cursor?:string};return{content:JSON.stringify(await history.read(scope,value.sessionId??scope.sessionId,value.cursor))};}},
  {name:'search_history',effect:'read',inputSchema:{type:'object',properties:{sessionId:{type:'string'},query:{type:'string',maxLength:1000}},required:['query'],additionalProperties:false},execute:async(input,scope)=>{const value=input as {sessionId?:SessionId;query:string};return{content:JSON.stringify(await history.search(scope,value.sessionId??scope.sessionId,value.query))};}}
 ]};
}
