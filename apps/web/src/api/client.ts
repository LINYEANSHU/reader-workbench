import type {Workspace,DirectoryEntry,FileEntry} from '../../../../packages/contracts/src/workspaces.js';
import type {WorkspaceId,SessionId,RunId,ArtifactId} from '../../../../packages/contracts/src/ids.js';
import type {DocumentRef,DocumentRecord,DocumentPage,Attachment,CaptureResult} from '../../../../packages/contracts/src/documents.js';
import type {SessionRecord,HistoryPage,AskRequest} from '../../../../packages/contracts/src/sessions.js';
import type {MaskedModelSettings,ModelSettings,ModelCapabilities} from '../../../../packages/contracts/src/models.js';
import type {RunRecord,DocumentJobRecord} from '../../../../packages/contracts/src/runs.js';
import type {ArtifactRecord} from '../../../../packages/contracts/src/artifacts.js';
import type {UiState} from '../../../../packages/contracts/src/ui-state.js';
import type {LayoutPreset} from '../../../../packages/contracts/src/layout.js';
import type {SelectionContext} from '../../../../packages/contracts/src/documents.js';import type {SelectionActionResult} from '../../../../packages/contracts/src/tools.js';
export class ApiError extends Error{constructor(readonly code:string,message:string,readonly status:number){super(message);}}
export class ApiClient{
 async saveAttachment(workspaceId:WorkspaceId,sessionId:SessionId,result:CaptureResult,captureKind:'document'|'screen'){const bytes=new Uint8Array(await result.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return this.request<Attachment>('/attachments',{method:'POST',body:{workspaceId,sessionId,data:btoa(binary),metadata:{width:result.width,height:result.height,anchors:result.anchors,captureKind}}});}
 attachment(workspaceId:WorkspaceId,sessionId:SessionId,id:string){return this.request<Attachment>('/attachments/'+encodeURIComponent(id)+'?workspaceId='+workspaceId+'&sessionId='+sessionId+'&metadata=true');}
 async request<T>(path:string,options:{method?:string;body?:unknown;signal?:AbortSignal;keepalive?:boolean}={}):Promise<T>{
  const response=await fetch('/api/v1'+path,{method:options.method??'GET',credentials:'same-origin',signal:options.signal,keepalive:options.keepalive,...(options.body!==undefined?{headers:{'content-type':'application/json'},body:JSON.stringify(options.body)}:{})});
  const result=await response.json().catch(()=>({error:{code:'INVALID_RESPONSE',message:'服务没有返回可用响应'}}));
  if(!response.ok)throw new ApiError(result.error?.code??'REQUEST_FAILED',result.error?.message??'请求失败',response.status);return result as T;
 }
 config(){return this.request<{demo:boolean;workspace:string|null}>('/config');}
 layoutPresets(id:WorkspaceId){return this.request<LayoutPreset[]>('/workspaces/'+id+'/layout-presets');}
 selectionAction(id:WorkspaceId,session:SessionId,selection:SelectionContext,action='core.explain'){return this.request<SelectionActionResult>('/workspaces/'+id+'/sessions/'+session+'/selection-actions/'+encodeURIComponent(action),{method:'POST',body:{selection}});}
 workspaces(){return this.request<Workspace[]>('/workspaces');}
 directories(path:string){return this.request<DirectoryEntry[]>('/directories?path='+encodeURIComponent(path));}
 selectWorkspace(root:string){return this.request<Workspace>('/workspaces',{method:'POST',body:{root}});}
 files(id:WorkspaceId,path=''){return this.request<FileEntry[]>('/workspaces/'+id+'/files?path='+encodeURIComponent(path));}
 openFile(id:WorkspaceId,relativePath:string){return this.request<DocumentRecord>('/workspaces/'+id+'/documents/open',{method:'POST',body:{relativePath}});}
 importFile(id:WorkspaceId,name:string,bytesBase64:string){return this.request<DocumentRecord>('/workspaces/'+id+'/documents/import',{method:'POST',body:{name,bytesBase64}});}
 document(ref:DocumentRef,signal?:AbortSignal){return this.request<DocumentRecord>(documentPath(ref),{signal});}
 page(ref:DocumentRef,page:number,signal?:AbortSignal){return this.request<DocumentPage>(documentPath(ref,'/pages/'+page),{signal});}
 sessions(id:WorkspaceId){return this.request<SessionRecord[]>('/workspaces/'+id+'/sessions');}
 main(id:WorkspaceId,title='阅读会话'){return this.request<SessionRecord>('/workspaces/'+id+'/sessions',{method:'POST',body:{title}});}
 temporary(id:WorkspaceId,parent:SessionId){return this.request<SessionRecord>('/workspaces/'+id+'/sessions/'+parent+'/temporary',{method:'POST',body:{}});}
 history(id:WorkspaceId,session:SessionId,cursor?:string){return this.request<HistoryPage>('/workspaces/'+id+'/sessions/'+session+'/history'+(cursor?'?cursor='+encodeURIComponent(cursor):''));}
 clear(id:WorkspaceId,session:SessionId){return this.request('/workspaces/'+id+'/sessions/'+session+'/clear',{method:'POST',body:{}});}
 models(id:WorkspaceId){return this.request<MaskedModelSettings[]>('/workspaces/'+id+'/settings/models');}
 saveModel(id:WorkspaceId,settings:ModelSettings,key?:string){return this.request<MaskedModelSettings>('/workspaces/'+id+'/settings/models',{method:'PUT',body:{settings,...(key?{key}:{})}});}
 catalog(id:WorkspaceId,model:string){return this.request<Array<{id:string;capabilities?:ModelCapabilities}>>('/workspaces/'+id+'/settings/models/'+encodeURIComponent(model)+'/catalog');}
 output(id:WorkspaceId){return this.request<{directory:string}>('/workspaces/'+id+'/settings/output');}
 saveOutput(id:WorkspaceId,directory:string){return this.request('/workspaces/'+id+'/settings/output',{method:'PUT',body:{directory}});}
 submit(request:AskRequest){return this.request<{runId:RunId}>('/runs',{method:'POST',body:request});}
 run(id:WorkspaceId,run:RunId){return this.request<RunRecord|DocumentJobRecord>('/runs/'+run+'?workspaceId='+id);}
 cancel(id:WorkspaceId,run:RunId){return this.request('/runs/'+run+'/cancel',{method:'POST',body:{workspaceId:id}});}
 uiState(id:WorkspaceId,client:string){return this.request<UiState|null>('/ui-state/'+client+'?workspaceId='+id);}
 saveUiState(id:WorkspaceId,client:string,state:UiState){return this.request('/ui-state/'+client,{method:'PUT',body:{workspaceId:id,state},keepalive:true});}
 artifacts(id:WorkspaceId){return this.request<ArtifactRecord[]>('/artifacts?workspaceId='+id);}
 openArtifact(id:WorkspaceId,artifact:ArtifactId){return this.request<DocumentRecord>('/artifacts/'+artifact+'/open?workspaceId='+id,{method:'POST',body:{}});}
}
export const api=new ApiClient();
export function documentPath(ref:DocumentRef,suffix=''){return'/documents/'+ref.documentId+'/versions/'+ref.version+suffix+(suffix.includes('?')?'&':'?')+'workspaceId='+ref.workspaceId;}
export function documentUrl(ref:DocumentRef,suffix=''){return'/api/v1'+documentPath(ref,suffix);}
export function message(error:unknown){return error instanceof Error?error.message:'操作失败，请重试';}

export function attachmentUrl(attachment:Attachment){return '/api/v1/attachments/'+encodeURIComponent(attachment.id)+'?workspaceId='+attachment.workspaceId+'&sessionId='+attachment.sessionId;}
