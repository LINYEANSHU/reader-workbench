import type {DocumentRef,DocumentBlock,SearchHit} from '../../../contracts/src/documents.js';
import type {SqliteWorkspaceStore} from '../storage/workspace-store.js';
export class DocumentIndex {
 constructor(private store:SqliteWorkspaceStore){}
 replace(ref:DocumentRef,blocks:DocumentBlock[]){return this.store.documents.index(ref,blocks);}
 search(ref:DocumentRef,query:string,limit:number):Promise<SearchHit[]>{return this.store.documents.search(ref,query,limit);}
}
