import type {WorkspaceId,RunId,SessionId,DocumentId} from './ids.js';
import type {AskRequest,ContextEnvelope} from './sessions.js';
import type {PublicError} from './errors.js';
export type RunStatus='queued'|'running'|'completed'|'failed'|'cancelled';
export interface RunRecord {id:RunId;kind:'agent';workspaceId:WorkspaceId;sessionId:SessionId;status:RunStatus;contextRevision?:number;requestId:string;request:AskRequest;callerId:string;error?:PublicError;partialText?:string;result?:string;context?:ContextEnvelope;createdAt?:string;outputDirectory?:string}
export interface DocumentJobRecord {id:RunId;kind:'document';workspaceId:WorkspaceId;documentId:DocumentId;status:RunStatus;error?:PublicError}
export interface RunEvent {runId:RunId;workspaceId:WorkspaceId;seq:number;scope:{kind:'agent';sessionId:SessionId}|{kind:'document';documentId:DocumentId};kind:'state'|'progress'|'context'|'delta'|'tool-start'|'tool-result'|'citation'|'artifact'|'error';data:unknown}
export interface LifecycleEvent {kind:string;workspaceId:WorkspaceId;data:unknown}
