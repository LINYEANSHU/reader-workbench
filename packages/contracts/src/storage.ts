import type { WorkspaceId } from './ids.js';
import type {DocumentRef,StoredDocument,DocumentBlock,SearchHit} from './documents.js';
export interface DocumentStorePort {
  get(ref:DocumentRef):Promise<StoredDocument|null>;
  save(document:StoredDocument):Promise<void>;
  list():Promise<StoredDocument[]>;
  index(ref:DocumentRef,blocks:DocumentBlock[]):Promise<void>;
  search(ref:DocumentRef,query:string,limit:number):Promise<SearchHit[]>;
}
export interface WorkspaceStore {workspaceId:WorkspaceId;documents:DocumentStorePort;close():Promise<void>}
