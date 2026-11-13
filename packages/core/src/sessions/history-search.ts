import type {RunScope,SessionId} from '../../../contracts/src/ids.js';
import type {CommittedTurn} from '../../../contracts/src/sessions.js';
import type {SessionRepository} from './repository.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {memorySearchScore} from '../../../contracts/src/document-memory.js';
import {clip,excerptAround,HISTORY_ANSWER_CHARS} from '../tools/excerpt.js';
/** What the model sees of an archived turn: the dialogue, not its raw tool messages. */
export interface HistoryEntry {id:string;revision:number;question:string;answer:string;sourceAnchors:CommittedTurn['sourceAnchors'];selection?:string}
const entry=(turn:CommittedTurn,query?:string):HistoryEntry=>({id:turn.id,revision:turn.revision,question:query?excerptAround(turn.question,query,HISTORY_ANSWER_CHARS).text:clip(turn.question,HISTORY_ANSWER_CHARS),answer:query?excerptAround(turn.answer,query,HISTORY_ANSWER_CHARS).text:clip(turn.answer,HISTORY_ANSWER_CHARS),sourceAnchors:turn.sourceAnchors.slice(0,8),...(turn.selection?{selection:clip(turn.selection.text,1000)}:{})});
export class HistorySearch {
 constructor(private repository:SessionRepository){}
 private async turns(scope:RunScope,target:SessionId){
  const own=await this.repository.authorizeScope(scope);
  if(target!==own.id&&!(own.kind==='temporary'&&target===own.parentMainSessionId))throw new ReaderError('TOOL_SCOPE_DENIED','不能读取无关会话',403);
  return this.repository.getCommittedTurns(scope.workspaceId,target,scope.readRevisions?.[target]);
 }
 async read(scope:RunScope,target:SessionId,cursor?:string):Promise<HistoryEntry[]>{
  const before=cursor?Number(cursor):Number.POSITIVE_INFINITY;
  return (await this.turns(scope,target)).filter(turn=>turn.revision<before).slice(-20).map(turn=>entry(turn));
 }
 /** Full question text is read only after applying the same session and revision boundary as history search. */
 async question(scope:RunScope,target:SessionId,turnId:string):Promise<string>{
  const turn=(await this.turns(scope,target)).find(item=>item.id===turnId);
  if(!turn)throw new ReaderError('HISTORY_NOT_FOUND','本次可读历史中没有该问题',404);
  return turn.question;
 }
 /** Searches the full retained history; Chinese queries match by overlapping bigrams like document search. */
 async search(scope:RunScope,target:SessionId,query:string):Promise<HistoryEntry[]>{
  const turns=await this.turns(scope,target),rank=(value:string)=>turns.map(turn=>({turn,score:memorySearchScore(turn.question+'\n'+turn.answer,value)})).filter(item=>item.score>0);
  let ranked=rank(query);const descriptive=query.replace(/\d+(?:\.\d+)*/g,' ').trim();
  if(!ranked.length&&descriptive&&descriptive!==query.trim())ranked=rank(descriptive);
  return ranked.sort((a,b)=>b.score-a.score||b.turn.revision-a.turn.revision).slice(0,10).map(item=>entry(item.turn,query));
 }
}
