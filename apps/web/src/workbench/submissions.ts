import type {AskRequest,SessionRecord} from '../../../../packages/contracts/src/sessions.js';
import type {RunId,WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import type {WorkbenchState} from './state.js';
export interface PendingSubmission{request:AskRequest;runId?:RunId}
export type Submissions=Record<string,PendingSubmission>;
export function sameSubmission(left:AskRequest,right:Omit<AskRequest,'requestId'>){const snapshot=(item:Omit<AskRequest,'requestId'>)=>JSON.stringify([item.workspaceId,item.sessionId,item.question,item.documents,item.selection??null,item.attachmentIds,item.providerId,item.reasoningEffort??null,item.allowArtifactWrites]);return snapshot(left)===snapshot(right);}
export function submissionKey(client:string,workspaceId:WorkspaceId){return'reader:submissions:'+client+':'+workspaceId;}
export function loadSubmissions(key:string,workspaceId:WorkspaceId,sessions:SessionRecord[]):Submissions{
 try{const saved=JSON.parse(localStorage.getItem(key)??'{}') as Submissions;return Object.fromEntries(Object.entries(saved).filter(([id,item])=>sessions.some(session=>session.id===id)&&item?.request?.sessionId===id&&item.request.workspaceId===workspaceId&&typeof item.request.requestId==='string'&&typeof item.request.question==='string'));}catch{return{};}
}
/** Synchronous journal precedes the POST and survives a refresh before the 202 response. */
export function saveSubmissions(key:string,submissions:Submissions){if(Object.keys(submissions).length)localStorage.setItem(key,JSON.stringify(submissions));else localStorage.removeItem(key);}
export function loadUiRecovery(key:string,workspaceId:WorkspaceId):Partial<WorkbenchState>{try{const value=JSON.parse(localStorage.getItem(key+':ui')??'null');return value?.workspaceId===workspaceId?value:{};}catch{return{};}}
export function saveUiRecovery(key:string,state:WorkbenchState){localStorage.setItem(key+':ui',JSON.stringify(state));}
