import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {readerId,documentRefSchema,askRequestSchema} from '../../../../packages/contracts/src/validation.js';
import {ReaderError,publicError} from '../../../../packages/contracts/src/errors.js';
import type {Actor,WorkspaceId,SessionId,RunId,ArtifactId} from '../../../../packages/contracts/src/ids.js';
import type {DocumentRef} from '../../../../packages/contracts/src/documents.js';
import type {AskRequest} from '../../../../packages/contracts/src/sessions.js';
import type {WorkspaceService} from '../../../../packages/core/src/workspaces/service.js';
import type {DocumentService} from '../../../../packages/core/src/documents/service.js';
import type {SessionService} from '../../../../packages/core/src/sessions/service.js';
import type {RunService} from '../../../../packages/core/src/runs/service.js';
import type {ArtifactService} from '../../../../packages/core/src/artifacts/service.js';
import type {PluginManager} from '../../../../packages/core/src/plugins/manager.js';
import {registerReaderResources} from './resources.js';
export interface ReaderServices{workspaces:WorkspaceService;documents:DocumentService;sessions:SessionService;runs:RunService;artifacts:ArtifactService;plugins:PluginManager}
interface Definition{description:string;schema:z.ZodObject;readOnly:boolean}
const ws={workspaceId:readerId},run={...ws,runId:readerId};
export const readerOperations:Record<string,Definition>={
 list_workspaces:{description:'列出调用者已选择的工作区',schema:z.object({}).strict(),readOnly:true},
 select_workspace:{description:'选择本机已有工作区目录；保留所有原文件',schema:z.object({root:z.string().min(1).max(4096)}).strict(),readOnly:false},
 list_workspace_files:{description:'列出工作区相对目录中的文件',schema:z.object({...ws,relativePath:z.string().max(4096).default('')}).strict(),readOnly:true},
 open_document:{description:'打开工作区内的原文件，返回文档处理运行标识',schema:z.object({...ws,relativePath:z.string().min(1).max(4096)}).strict(),readOnly:false},
 read_document_page:{description:'读取指定不可变版本的页面文字和锚点',schema:documentRefSchema.extend({page:z.number().int().min(1)}).strict(),readOnly:true},
 search_document:{description:'搜索文档全文及来源锚点',schema:documentRefSchema.extend({query:z.string().max(4096),limit:z.number().int().min(1).max(100).default(20)}).strict(),readOnly:true},
 create_reading_session:{description:'创建主会话；提供 parentMainSessionId 则创建隔离的临时会话',schema:z.object({...ws,title:z.string().max(256).default('阅读会话'),parentMainSessionId:readerId.optional()}).strict(),readOnly:false},
 ask_main:{description:'向主会话提问，立即返回 runId；不会等待全部输出',schema:askRequestSchema,readOnly:false},
 ask_temporary:{description:'向临时会话提问；继承最新完成的主会话且不回写',schema:askRequestSchema,readOnly:false},
 get_run:{description:'读取运行状态、输出和来源；包含文档处理运行',schema:z.object(run).strict(),readOnly:true},
 get_run_events:{description:'读取 afterSeq 之后已保存的运行事件，供恢复进度',schema:z.object({...run,afterSeq:z.number().int().min(0).default(0)}).strict(),readOnly:true},
 cancel_run:{description:'取消运行并释放网络请求及工具进程',schema:z.object(run).strict(),readOnly:false},
 list_artifacts:{description:'列出此工作区或指定会话生成的文件',schema:z.object({...ws,sessionId:readerId.optional()}).strict(),readOnly:true},
 open_artifact:{description:'检查输出哈希后打开生成的文件',schema:z.object({...ws,artifactId:readerId}).strict(),readOnly:false},
 list_plugins:{description:'列出此工作区安装的扩展及非敏感设置',schema:z.object(ws).strict(),readOnly:true}
};
export async function authorizeWorkspace(services:ReaderServices,workspaceId:WorkspaceId,actor:Actor){
 if(!(await services.workspaces.listRecent(actor)).some(workspace=>workspace.id===workspaceId))throw new ReaderError('WORKSPACE_DENIED','工作区不属于此调用者',403);
}
export async function authorizeSession(services:ReaderServices,workspaceId:WorkspaceId,sessionId:SessionId,actor:Actor){
 await authorizeWorkspace(services,workspaceId,actor);const session=await services.sessions.repository.getSession(workspaceId,sessionId);
 if(session.callerId!==actor.callerId)throw new ReaderError('SESSION_DENIED','会话不属于此调用者',403);return session;
}
export async function invokeReaderOperation(services:ReaderServices,actor:Actor,name:string,raw:unknown,signal:AbortSignal):Promise<Record<string,unknown>>{
 const operation=readerOperations[name];if(!operation)throw new ReaderError('OPERATION_UNAVAILABLE','调用方法不存在',404);
 const parsed=operation.schema.safeParse(raw);if(!parsed.success)throw new ReaderError('INVALID_REQUEST','调用参数无效');const input=parsed.data as Record<string,unknown>;
 signal.throwIfAborted();const workspaceId=input.workspaceId as WorkspaceId;
 if(workspaceId)await authorizeWorkspace(services,workspaceId,actor);
 switch(name){
  case 'list_workspaces':return{workspaces:await services.workspaces.listRecent(actor)};
  case 'select_workspace':return{...await services.workspaces.select(input.root as string,actor)};
  case 'list_workspace_files':return{files:await services.workspaces.listFiles(workspaceId,input.relativePath as string)};
  case 'open_document':return{...await services.documents.open(workspaceId,input.relativePath as string,signal)};
  case 'read_document_page':{const {imagePath,...page}=await services.documents.readPage(input as unknown as DocumentRef,input.page as number);return{...page,hasImage:Boolean(imagePath)};}
  case 'search_document':return{hits:await services.documents.search(input as unknown as DocumentRef,input.query as string,input.limit as number)};
  case 'create_reading_session':{
   if(input.parentMainSessionId){await authorizeSession(services,workspaceId,input.parentMainSessionId as SessionId,actor);return{...await services.sessions.createTemporary(workspaceId,input.parentMainSessionId as SessionId)};}
   return{...await services.sessions.createMain(workspaceId,input.title as string)};
  }
  case 'ask_main':case 'ask_temporary':{
   const session=await authorizeSession(services,workspaceId,input.sessionId as SessionId,actor);
   if(session.kind!==(name==='ask_main'?'main':'temporary'))throw new ReaderError('SESSION_KIND_INVALID','请选择对应的主会话或临时会话');
   return services.runs.submit(input as unknown as AskRequest,actor);
  }
  case 'get_run':case 'get_run_events':case 'cancel_run':{
   const record=await services.runs.get(workspaceId,input.runId as RunId);
   if(record.kind==='agent')await authorizeSession(services,workspaceId,record.sessionId,actor);
   if(name==='get_run')return{...record};
   if(name==='cancel_run'){await services.runs.cancel(workspaceId,input.runId as RunId,actor);return{cancelled:true};}
   const saved=await services.runs.readSavedEvents(workspaceId,input.runId as RunId,input.afterSeq as number),events=saved.slice(0,500);return{events,nextAfterSeq:events.at(-1)?.seq??input.afterSeq,hasMore:saved.length>events.length};
  }
  case 'list_artifacts':{if(input.sessionId)await authorizeSession(services,workspaceId,input.sessionId as SessionId,actor);const artifacts=await services.artifacts.list(workspaceId,input.sessionId as SessionId|undefined);for(const artifact of artifacts)await authorizeSession(services,workspaceId,artifact.sessionId,actor);return{artifacts};}
  case 'open_artifact':{const artifact=await services.artifacts.get(workspaceId,input.artifactId as ArtifactId);await authorizeSession(services,workspaceId,artifact.sessionId,actor);return{...await services.artifacts.open(workspaceId,artifact.id)};}
  case 'list_plugins':return{plugins:services.plugins.list(workspaceId)};
  default:throw new ReaderError('OPERATION_UNAVAILABLE','调用方法不存在',404);
 }
}
export function createMcpServer(services:ReaderServices,actor:Actor):McpServer{
 const server=new McpServer({name:'reader-workbench',version:'0.4.0'});
 for(const [name,operation] of Object.entries(readerOperations))server.registerTool(name,{description:operation.description,inputSchema:operation.schema,annotations:{readOnlyHint:operation.readOnly,destructiveHint:false,openWorldHint:false}},async(input,ctx)=>{
  try{const result=await invokeReaderOperation(services,actor,name,input,ctx.mcpReq.signal);return{content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result};}
  catch(error){const result=publicError(error);return{isError:true,content:[{type:'text' as const,text:JSON.stringify(result)}]};}
 });
 registerReaderResources(server,services,actor);return server;
}
