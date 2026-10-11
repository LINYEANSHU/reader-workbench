import type {DatabaseSync} from 'node:sqlite';
import type {WorkspaceStore,DocumentStorePort} from '../../../contracts/src/storage.js';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {UiState} from '../../../contracts/src/ui-state.js';
import {openDatabase} from './database.js';
import type {DocumentRef,DocumentBlock,SearchHit,StoredDocument} from '../../../contracts/src/documents.js';
export class SqliteWorkspaceStore implements WorkspaceStore {
  readonly documents:DocumentStorePort={
    get:async ref=>{this.checkWorkspace(ref.workspaceId);return this.getRecord<StoredDocument>('documents',ref.documentId+':'+ref.version);},
    save:async document=>{this.checkWorkspace(document.record.workspaceId);this.putRecord('documents',document.record.documentId+':'+document.record.version,document);},
    list:async()=>this.listRecords<StoredDocument>('documents'),
    index:async(ref,blocks)=>this.indexDocument(ref,blocks),
    search:async(ref,query,limit)=>this.searchDocument(ref,query,limit)
  };
  private checkWorkspace(workspaceId:WorkspaceId){if(workspaceId!==this.workspaceId)throw new Error('Workspace mismatch');}
  private database:DatabaseSync;private closed=false;
  constructor(readonly workspaceId:WorkspaceId,file:string){this.database=openDatabase(file);}
  async saveUiState(clientId:string,state:UiState){
    this.database.prepare('INSERT INTO ui_state(client_id,data) VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET data=excluded.data').run(clientId,JSON.stringify(state));
  }
  async getUiState(clientId:string):Promise<UiState|null>{
    const row=this.database.prepare('SELECT data FROM ui_state WHERE client_id=?').get(clientId) as {data:string}|undefined;
    return row?JSON.parse(row.data) as UiState:null;
  }
  getRecord<T>(domain:string,id:string):T|null{
    const row=this.database.prepare('SELECT data FROM records WHERE domain=? AND id=?').get(domain,id) as {data:string}|undefined;
    return row?JSON.parse(row.data) as T:null;
  }
  putRecord(domain:string,id:string,value:unknown){this.database.prepare('INSERT INTO records(domain,id,data) VALUES(?,?,?) ON CONFLICT(domain,id) DO UPDATE SET data=excluded.data').run(domain,id,JSON.stringify(value));}
  listRecords<T>(domain:string):T[]{return (this.database.prepare('SELECT data FROM records WHERE domain=? ORDER BY rowid').all(domain) as {data:string}[]).map(row=>JSON.parse(row.data) as T);}
  deleteRecord(domain:string,id:string){this.database.prepare('DELETE FROM records WHERE domain=? AND id=?').run(domain,id);}
  indexDocument(ref:DocumentRef,blocks:DocumentBlock[]){
    if(ref.workspaceId!==this.workspaceId)throw new Error('Workspace mismatch');
    this.transaction(()=>{
      this.database.prepare('DELETE FROM document_index WHERE document_id=? AND version=?').run(ref.documentId,ref.version);
      const insert=this.database.prepare('INSERT INTO document_index(document_id,version,block_id,text,anchor) VALUES(?,?,?,?,?)');
      for(const block of blocks)insert.run(ref.documentId,ref.version,block.id,block.text,JSON.stringify(block.anchor));
    });
  }
  searchDocument(ref:DocumentRef,query:string,limit:number):SearchHit[]{
    if(ref.workspaceId!==this.workspaceId)throw new Error('Workspace mismatch');
    if(query.length>1000)return [];
    const rows=query.length<3?
      this.database.prepare("SELECT text,anchor,0 AS score FROM document_index WHERE document_id=? AND version=? AND text LIKE ? ESCAPE '\\' LIMIT ?").all(ref.documentId,ref.version,'%'+query.replace(/[\\%_]/g,'\\$&')+'%',limit):
      this.database.prepare('SELECT text,anchor,bm25(document_index) AS score FROM document_index WHERE document_index MATCH ? AND document_id=? AND version=? ORDER BY score LIMIT ?').all('"'+query.replaceAll('"','""')+'"',ref.documentId,ref.version,limit);
    return (rows as {text:string;anchor:string;score:number}[]).map(row=>({text:row.text,anchor:JSON.parse(row.anchor),score:row.score}));
  }
  transaction<T>(callback:()=>T):T{this.database.exec('BEGIN IMMEDIATE');try{const result=callback();this.database.exec('COMMIT');return result;}catch(error){this.database.exec('ROLLBACK');throw error;}}
  async close(){if(!this.closed){this.database.close();this.closed=true;}}
}
