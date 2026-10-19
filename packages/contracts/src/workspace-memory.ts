import type {DocumentRef,SourceAnchor} from './documents.js';
import type {WorkspaceId} from './ids.js';
export interface WorkspaceMemorySource {relativePath:string;page:number;anchor:SourceAnchor}
export interface WorkspaceMemoryItem {id:string;text:string;sources:WorkspaceMemorySource[]}
export interface WorkspaceMemoryEngine {
 available():Promise<boolean>;
 replace(workspaceId:WorkspaceId,items:WorkspaceMemoryItem[],signal:AbortSignal):Promise<void>;
 search(workspaceId:WorkspaceId,query:string,signal:AbortSignal):Promise<string[]>;
 close():Promise<void>;
}
export interface WorkspaceMemoryStatus {
 enabled:boolean;available:boolean;state:'disabled'|'unavailable'|'idle'|'indexing'|'ready'|'failed';
 discoveredFiles:number;indexedFiles:number;uniquePassages:number;sourcePassages:number;
 skipped:Array<{relativePath:string;reason:string}>;updatedAt?:string;error?:string;
}
export interface WorkspaceMemorySnapshot {fingerprint:string;items:WorkspaceMemoryItem[];status:WorkspaceMemoryStatus}
export interface WorkspaceMemoryHit extends WorkspaceMemoryItem {}
export interface WorkspaceMemoryOptions {exclude?:DocumentRef[];budgetBytes?:number}
