import type {WorkspaceId,DocumentId,DocumentVersion,RunId,AttachmentId,SessionId} from './ids.js';
export interface DocumentRef {workspaceId:WorkspaceId;documentId:DocumentId;version:DocumentVersion}
export type PageAnchor={kind:'page';page:number;rect?:[number,number,number,number]};
export type BlockAnchor={kind:'block';blockId:string;start:number;end:number};
export type SourceAnchor=DocumentRef&{location:PageAnchor|BlockAnchor};
export interface SelectionContext {text:string;anchors:SourceAnchor[]}
export interface DocumentRecord extends DocumentRef {id:DocumentId;relativePath:string;mime:string;viewer:ViewerDescriptor;parseState:'queued'|'converting'|'indexing'|'ready'|'failed'|'cancelled';pageCount:number;processingRunId:RunId;warnings:string[]}
export interface ViewerDescriptor {kind:'markdown'|'pdf'|'text'|'image'|'fallback'|'plugin';moduleKey?:string}
export interface VersionedFile extends DocumentRef {path:string;cacheDir:string;mime:string;extension:string;relativePath:string}
export interface DocumentBlock {id:string;text:string;anchor:SourceAnchor;kind?:string}
export interface DocumentPage {page:number;text:string;width:number;height:number;imagePath?:string;anchors:SourceAnchor[]}
export interface ParsedDocument {pages:DocumentPage[];blocks:DocumentBlock[];warnings:string[];pdfPath?:string}
export interface SearchHit {text:string;anchor:SourceAnchor;score:number}
export interface Attachment {id:AttachmentId;workspaceId:WorkspaceId;sessionId:SessionId;mime:string;sha256:string;anchors:SourceAnchor[];width:number;height:number}
export interface CaptureMetadata {width:number;height:number;anchors:SourceAnchor[];captureKind:'document'|'screen'}
export interface ViewportRect {x:number;y:number;width:number;height:number}
export interface CaptureResult {blob:Blob;width:number;height:number;anchors:SourceAnchor[]}
export interface CaptureRequest {rect?:ViewportRect;document?:DocumentRef;signal:AbortSignal}
export interface ViewerHandle {navigate(anchor:SourceAnchor):Promise<void>;getSelection():SelectionContext|null;capture(rect:ViewportRect):Promise<CaptureResult>}
