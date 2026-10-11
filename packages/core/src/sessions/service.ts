import {randomUUID} from 'node:crypto';
import type {SessionRepository} from './repository.js';
import type {WorkspaceId,SessionId,Actor} from '../../../contracts/src/ids.js';
import type {SessionRecord,HistoryPage} from '../../../contracts/src/sessions.js';
import {ReaderError} from '../../../contracts/src/errors.js';
export class SessionService{
 constructor(readonly repository:SessionRepository){}
 async createMain(workspaceId:WorkspaceId,title:string):Promise<SessionRecord>{
  if(typeof title!=='string'||title.length>256)throw new ReaderError('INVALID_TITLE','会话标题无效');
  const session:SessionRecord={id:randomUUID() as SessionId,workspaceId,kind:'main',revision:0,epoch:0,title,createdAt:new Date().toISOString(),callerId:'local-owner'};
  await(await this.repository.workspaces.storeFor(workspaceId)).sessions.createSession(session);return session;
 }
 async createTemporary(workspaceId:WorkspaceId,parentMainSessionId:SessionId):Promise<SessionRecord>{
  const parent=await this.repository.getSession(workspaceId,parentMainSessionId);
  if(parent.kind!=='main')throw new ReaderError('INVALID_PARENT_SESSION','临时会话必须继承主会话');
  const session:SessionRecord={id:randomUUID() as SessionId,workspaceId,kind:'temporary',parentMainSessionId,revision:0,epoch:0,title:'临时追问',createdAt:new Date().toISOString(),callerId:parent.callerId};
  await(await this.repository.workspaces.storeFor(workspaceId)).sessions.createSession(session);return session;
 }
 async clearTemporary(workspaceId:WorkspaceId,sessionId:SessionId,actor:Actor):Promise<void>{await(await this.repository.workspaces.storeFor(workspaceId)).sessions.clearTemporary(sessionId,actor);}
 async getHistory(workspaceId:WorkspaceId,sessionId:SessionId,cursor?:string):Promise<HistoryPage>{
  const snapshot=await this.repository.snapshot(workspaceId,sessionId);
  const before=cursor?Number(cursor):snapshot.session.revision+1;
  if(!Number.isSafeInteger(before)||before<0)throw new ReaderError('INVALID_CURSOR','历史游标无效');
  const available=snapshot.turns.filter(turn=>turn.revision<before),turns=available.slice(-50);
  return {session:snapshot.session,turns,nextCursor:available.length>turns.length?String(turns[0]!.revision):undefined};
 }
 async list(workspaceId:WorkspaceId):Promise<SessionRecord[]>{return(await this.repository.workspaces.storeFor(workspaceId)).sessions.listSessions();}
}
