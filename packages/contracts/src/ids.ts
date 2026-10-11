export type Id<K extends string> = string & {readonly __id:K};
export type WorkspaceId=Id<'workspace'>; export type DocumentId=Id<'document'>; export type SessionId=Id<'session'>;
export type RunId=Id<'run'>; export type ArtifactId=Id<'artifact'>; export type AttachmentId=Id<'attachment'>;
export type DocumentVersion=Id<'sha256'>;
export interface Actor {callerId:string;transport:'web'|'http'|'mcp'|'internal'}
export interface RunScope {actor:Actor;workspaceId:WorkspaceId;sessionId:SessionId;runId:RunId;allowArtifactWrites:boolean;readRevisions?:Record<string,number>}
