import type { WorkspaceId } from './ids.js';
export interface Workspace {id:WorkspaceId;root:string;name:string}
export interface DirectoryEntry {name:string;path:string}
export interface FileEntry {name:string;relativePath:string;kind:'file'|'directory';size:number}
