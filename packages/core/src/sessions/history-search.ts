import type {RunScope,SessionId} from '../../../contracts/src/ids.js';
import type {SessionRepository} from './repository.js';
import {ReaderError} from '../../../contracts/src/errors.js';
export class HistorySearch {
 constructor(private repository:SessionRepository){}
 async read(scope:RunScope,target:SessionId,cursor?:string){
  const own=await this.repository.authorizeScope(scope);
  if(target!==own.id&&!(own.kind==='temporary'&&target===own.parentMainSessionId))throw new ReaderError('TOOL_SCOPE_DENIED','不能读取无关会话',403);
  const turns=await this.repository.getCommittedTurns(scope.workspaceId,target);
  const before=cursor?Number(cursor):Number.POSITIVE_INFINITY;
  return turns.filter(turn=>turn.revision<before).slice(-20);
 }
 async search(scope:RunScope,target:SessionId,query:string){
  const turns=await this.read(scope,target);
  // Search the full retained current history, not only the recent read page.
  const all=await this.repository.getCommittedTurns(scope.workspaceId,target);
  return all.filter(turn=>turn.question.includes(query)||turn.answer.includes(query)).slice(0,20);
 }
}
