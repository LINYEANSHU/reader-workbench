import type {WorkspaceId,SessionId,RunId,ArtifactId} from './ids.js';
import type {SourceAnchor} from './documents.js';
export type ContentBlock={kind:'heading';text:string;level:number}|{kind:'paragraph'|'formula';text:string}|{kind:'list';items:string[]}|{kind:'table';rows:string[][]}|{kind:'image';data:Uint8Array;mime:string;alt:string};
export interface Coverage {status:'complete'|'partial';sourceBlockIds:string[];note?:string}
export interface ArtifactInput {format:'md'|'txt'|'docx'|'pptx'|'pdf'|'binary';name:string;blocks:ContentBlock[];sourceAnchors:SourceAnchor[];coverage?:Coverage;bytes?:Uint8Array;mime?:string}
export interface ArtifactRecord {id:ArtifactId;workspaceId:WorkspaceId;sessionId:SessionId;runId:RunId;relativePath:string;mime:string;sha256:string;sourceAnchors:SourceAnchor[];coverage?:Coverage}
export interface ExportedBytes {mime:string;extension:string;bytes:Uint8Array}
