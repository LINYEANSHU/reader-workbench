import type {WorkspaceId,SessionId,RunId} from './ids.js';
import type {DocumentRef,SelectionContext,SourceAnchor} from './documents.js';
import type {AttachmentId} from './ids.js';
import type {ModelMessage} from './models.js';
export interface SessionRecord {id:SessionId;workspaceId:WorkspaceId;kind:'main'|'temporary';parentMainSessionId?:SessionId;revision:number;title?:string;createdAt?:string}
export interface CompletedTurn {id:string;runId:RunId;question:string;answer:string;messages:ModelMessage[];sourceAnchors:SourceAnchor[];attachmentIds:AttachmentId[]}
export interface CommittedTurn extends CompletedTurn {revision:number}
export interface HistoryPage {session:SessionRecord;turns:CommittedTurn[];nextCursor?:string}
export interface MemorySummary {text:string;turnIds:string[];revision:number}
export interface AskRequest {workspaceId:WorkspaceId;sessionId:SessionId;question:string;documents:DocumentRef[];selection?:SelectionContext;attachmentIds:AttachmentId[];providerId:string;requestId:string;allowArtifactWrites:boolean}
export interface ContextEnvelope {workspaceId:WorkspaceId;sessionId:SessionId;mainRevision:number;documents:DocumentRef[];messages:ReadonlyArray<ModelMessage>;sourceRanges:SourceAnchor[];budget:{limit:number;inputTokens:number;reservedOutputTokens:number};summaryCoverage:string[]}
