import type {WorkspaceId,SessionId,RunId} from './ids.js';
import type {DocumentRef,SelectionContext,SourceAnchor} from './documents.js';
import type {AttachmentId} from './ids.js';
import type {ModelMessage} from './models.js';
export interface SessionRecord {id:SessionId;workspaceId:WorkspaceId;kind:'main'|'temporary';parentMainSessionId?:SessionId;revision:number;title?:string;createdAt?:string;epoch?:number;callerId?:string}
export interface CompletedTurn {id:string;runId:RunId;question:string;answer:string;messages:ModelMessage[];sourceAnchors:SourceAnchor[];attachmentIds:AttachmentId[]}
export interface CommittedTurn extends CompletedTurn {revision:number}
export interface HistoryPage {session:SessionRecord;turns:CommittedTurn[];nextCursor?:string}
export interface MemorySummary {text:string;turnIds:string[];revision:number;parentTurnIds?:string[];parentRevision?:number}
export interface SessionSnapshot {session:SessionRecord;turns:CommittedTurn[];summary:MemorySummary|null;toolState:Record<string,unknown>}
export interface AskRequest {workspaceId:WorkspaceId;sessionId:SessionId;question:string;documents:DocumentRef[];selection?:SelectionContext;attachmentIds:AttachmentId[];providerId:string;requestId:string;allowArtifactWrites:boolean;reasoningEffort?:string}
export interface ContextEnvelope {workspaceId:WorkspaceId;sessionId:SessionId;mainRevision:number;ownRevision?:number;memory?:MemorySummary;documents:DocumentRef[];messages:ReadonlyArray<ModelMessage>;sourceRanges:SourceAnchor[];budget:{limit:number;inputTokens:number;reservedOutputTokens:number;estimated?:boolean;reservedToolTokens?:number};summaryCoverage:string[]}
