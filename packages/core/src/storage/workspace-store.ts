import type {DatabaseSync} from 'node:sqlite';
import type {WorkspaceStore,DocumentStorePort,SessionStorePort} from '../../../contracts/src/storage.js';
import type {WorkspaceId,SessionId,RunScope,RunId} from '../../../contracts/src/ids.js';
import type {UiState} from '../../../contracts/src/ui-state.js';
import {openDatabase} from './database.js';
import type {DocumentRef,DocumentBlock,SearchHit,StoredDocument} from '../../../contracts/src/documents.js';
import type {SessionRecord,SessionSnapshot,CommittedTurn} from '../../../contracts/src/sessions.js';
import {ReaderError} from '../../../contracts/src/errors.js';
export class SqliteWorkspaceStore implements WorkspaceStore {
  private scopes=new Map<RunId,{scope:RunScope;references:number}>();
  bindScope(scope:RunScope):()=>void{
    this.checkWorkspace(scope.workspaceId);const previous=this.scopes.get(scope.runId);
    if(previous&&JSON.stringify(previous.scope)!==JSON.stringify(scope))throw new ReaderError('TOOL_SCOPE_DENIED','运行身份不匹配',403);
    const entry=previous??{scope:structuredClone(scope),references:0};entry.references++;this.scopes.set(scope.runId,entry);
    let released=false;return()=>{if(released)return;released=true;if(--entry.references===0)this.scopes.delete(scope.runId);};
  }
  async authorizeScope(scope:RunScope):Promise<SessionRecord>{
    const trusted=this.scopes.get(scope.runId);
    if(!trusted||JSON.stringify(trusted.scope)!==JSON.stringify(scope)||scope.workspaceId!==this.workspaceId)throw new ReaderError('TOOL_SCOPE_DENIED','该运行没有此会话的写权限',403);
    const session=await this.sessions.getSession(scope.sessionId);
    if(session.callerId&&session.callerId!==scope.actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','会话调用者不匹配',403);
    return session;
  }
  private readSession(id:SessionId):SessionRecord{
    const row=this.database.prepare('SELECT data FROM sessions WHERE id=?').get(id) as {data:string}|undefined;
    if(!row)throw new ReaderError('SESSION_UNAVAILABLE','此工作区中不存在该会话',404);return JSON.parse(row.data) as SessionRecord;
  }
  private readTurns(id:SessionId,revision?:number):CommittedTurn[]{
    const session=this.readSession(id);
    const rows=this.database.prepare('SELECT data FROM session_turns WHERE session_id=? AND epoch=? AND revision<=? ORDER BY revision').all(id,session.epoch??0,revision??session.revision) as {data:string}[];
    return rows.map(row=>JSON.parse(row.data) as CommittedTurn);
  }
  readonly sessions:SessionStorePort={
    createSession:async session=>{
      this.checkWorkspace(session.workspaceId);
      if(session.parentMainSessionId){const parent=this.readSession(session.parentMainSessionId);if(parent.kind!=='main')throw new ReaderError('INVALID_PARENT_SESSION','临时会话必须继承主会话');}
      this.database.prepare('INSERT INTO sessions(id,parent_id,data) VALUES(?,?,?)').run(session.id,session.parentMainSessionId??null,JSON.stringify(session));
    },
    listSessions:async()=> (this.database.prepare('SELECT data FROM sessions ORDER BY rowid').all() as {data:string}[]).map(row=>JSON.parse(row.data) as SessionRecord),
    getSession:async id=>this.readSession(id),
    getCommittedTurns:async(id,revision)=>this.readTurns(id,revision),
    snapshot:async id=>this.transaction(()=>{
      const session=this.readSession(id),turns=this.readTurns(id,session.revision);
      const summary=this.database.prepare('SELECT data FROM session_summaries WHERE session_id=?').get(id) as {data:string}|undefined;
      const state=this.database.prepare('SELECT data FROM session_tool_state WHERE session_id=?').get(id) as {data:string}|undefined;
      return {session,turns,summary:summary?JSON.parse(summary.data):null,toolState:state?JSON.parse(state.data):{}} as SessionSnapshot;
    }),
    completeOwnTurn:async(scope,turn)=>{
      await this.authorizeScope(scope);
      if(turn.runId!==scope.runId)throw new ReaderError('TOOL_SCOPE_DENIED','轮次不属于该运行',403);
      if(turn.sourceAnchors.some(anchor=>anchor.workspaceId!==scope.workspaceId))throw new ReaderError('TOOL_SCOPE_DENIED','来源引用不能越过工作区',403);
      return this.transaction(()=>{
        const session=this.readSession(scope.sessionId);
        const previous=this.database.prepare('SELECT session_id,revision FROM session_turns WHERE run_id=?').get(scope.runId) as {session_id:string;revision:number}|undefined;
        if(previous){if(previous.session_id!==scope.sessionId)throw new ReaderError('TOOL_SCOPE_DENIED','轮次不能写入其他会话',403);return previous.revision;}
        session.revision++;const committed={...structuredClone(turn),revision:session.revision};
        this.database.prepare('INSERT INTO session_turns(id,session_id,run_id,revision,epoch,data) VALUES(?,?,?,?,?,?)').run(turn.id,scope.sessionId,scope.runId,session.revision,session.epoch??0,JSON.stringify(committed));
        this.database.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(session),session.id);return session.revision;
      });
    },
    saveOwnSummary:async(scope,summary)=>{
      await this.authorizeScope(scope);
      this.transaction(()=>{
        const session=this.readSession(scope.sessionId),turns=this.readTurns(scope.sessionId),ids=new Set(turns.map(turn=>turn.id));
        if(summary.revision!==session.revision||summary.turnIds.some(id=>!ids.has(id)))throw new ReaderError('SUMMARY_SCOPE_DENIED','摘要覆盖范围不属于当前会话版本',403);
        if(summary.parentTurnIds?.length){
          if(session.kind!=='temporary'||!session.parentMainSessionId||summary.parentRevision===undefined)throw new ReaderError('SUMMARY_SCOPE_DENIED','摘要父来源无效',403);
          const parent=this.readSession(session.parentMainSessionId);
          if(summary.parentRevision>parent.revision||summary.parentRevision<0)throw new ReaderError('SUMMARY_SCOPE_DENIED','摘要引用尚未提交的父轮次',403);
          const parentIds=new Set(this.readTurns(parent.id,summary.parentRevision).map(turn=>turn.id));
          if(summary.parentTurnIds.some(id=>!parentIds.has(id)))throw new ReaderError('SUMMARY_SCOPE_DENIED','摘要父来源不属于该分支',403);
        }
        this.database.prepare('INSERT INTO session_summaries(session_id,data) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET data=excluded.data').run(scope.sessionId,JSON.stringify(summary));
      });
    },
    saveOwnToolState:async(scope,state)=>{
      await this.authorizeScope(scope);
      this.database.prepare('INSERT INTO session_tool_state(session_id,data) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET data=excluded.data').run(scope.sessionId,JSON.stringify(state));
    },
    clearTemporary:async(id,actor)=>{
      const session=this.readSession(id);
      if(session.kind!=='temporary')throw new ReaderError('TOOL_SCOPE_DENIED','此操作只能清空临时会话',403);
      if(session.callerId!==actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','会话调用者不匹配',403);
      if([...this.scopes.values()].some(entry=>entry.scope.sessionId===id))throw new ReaderError('SESSION_BUSY','请先取消或等待当前临时运行',409);
      this.transaction(()=>{
        session.epoch=(session.epoch??0)+1;session.revision++;
        this.database.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(session),id);
        this.database.prepare('DELETE FROM session_summaries WHERE session_id=?').run(id);this.database.prepare('DELETE FROM session_tool_state WHERE session_id=?').run(id);
      });
    }
  };
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
