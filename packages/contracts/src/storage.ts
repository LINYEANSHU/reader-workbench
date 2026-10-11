import type {WorkspaceId,SessionId,RunScope,Actor} from './ids.js';
import type {DocumentRef,StoredDocument,DocumentBlock,SearchHit} from './documents.js';
import type {SessionRecord,SessionSnapshot,CommittedTurn,CompletedTurn,MemorySummary} from './sessions.js';
import type {RunId} from './ids.js';
import type {RunRecord,RunEvent,RunStatus} from './runs.js';
import type {PublicError} from './errors.js';
import type {ArtifactRecord} from './artifacts.js';
import type {Attachment} from './documents.js';
import type {AttachmentId} from './ids.js';
import type {ArtifactId} from './ids.js';
export interface DocumentStorePort {
  get(ref:DocumentRef):Promise<StoredDocument|null>;
  save(document:StoredDocument):Promise<void>;
  list():Promise<StoredDocument[]>;
  index(ref:DocumentRef,blocks:DocumentBlock[]):Promise<void>;
  search(ref:DocumentRef,query:string,limit:number):Promise<SearchHit[]>;
}
export interface SessionStorePort {
  createSession(session:SessionRecord):Promise<void>;
  listSessions():Promise<SessionRecord[]>;
  getSession(id:SessionId):Promise<SessionRecord>;
  getCommittedTurns(id:SessionId,atRevision?:number):Promise<CommittedTurn[]>;
  snapshot(id:SessionId):Promise<SessionSnapshot>;
  /** Check cancellation immediately before the atomic commit. A committed turn remains completed. */
  completeOwnTurn(scope:RunScope,turn:CompletedTurn,signal?:AbortSignal):Promise<number>;
  saveOwnSummary(scope:RunScope,summary:MemorySummary):Promise<void>;
  saveOwnToolState(scope:RunScope,state:Record<string,unknown>):Promise<void>;
  clearTemporary(id:SessionId,actor:Actor):Promise<void>;
}
export interface RunStorePort {
 get(id:RunId):Promise<RunRecord>;
 create(record:RunRecord):Promise<void>;
 save(record:RunRecord):Promise<void>;
 list():Promise<RunRecord[]>;
 appendEvent(event:RunEvent):Promise<void>;
 readEvents(id:RunId,afterSeq:number):Promise<RunEvent[]>;
 setStatus(id:RunId,status:RunStatus,error?:PublicError):Promise<void>;
}
export interface ArtifactStorePort {get(id:ArtifactId):Promise<ArtifactRecord|null>;save(record:ArtifactRecord):Promise<void>;list(sessionId?:SessionId):Promise<ArtifactRecord[]>}
export interface AttachmentStorePort {get(id:AttachmentId):Promise<Attachment|null>;save(record:Attachment):Promise<void>;list(sessionId:SessionId):Promise<Attachment[]>}
export interface WorkspaceStore {workspaceId:WorkspaceId;documents:DocumentStorePort;sessions:SessionStorePort;runs:RunStorePort;artifacts:ArtifactStorePort;attachments:AttachmentStorePort;close():Promise<void>}
