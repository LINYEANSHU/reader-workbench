import type {DatabaseSync} from 'node:sqlite';
import type {WorkspaceStore} from '../../../contracts/src/storage.js';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {UiState} from '../../../contracts/src/ui-state.js';
import {openDatabase} from './database.js';
export class SqliteWorkspaceStore implements WorkspaceStore {
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
  transaction<T>(callback:()=>T):T{this.database.exec('BEGIN IMMEDIATE');try{const result=callback();this.database.exec('COMMIT');return result;}catch(error){this.database.exec('ROLLBACK');throw error;}}
  async close(){if(!this.closed){this.database.close();this.closed=true;}}
}
