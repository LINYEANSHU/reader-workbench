import type {WorkspaceService} from '../workspaces/service.js';
import type {RunScope,WorkspaceId,SessionId} from '../../../contracts/src/ids.js';
import type {CompletedTurn,SessionRecord,MemorySummary,CommittedTurn,SessionSnapshot} from '../../../contracts/src/sessions.js';
export class SessionRepository{
 constructor(readonly workspaces:WorkspaceService){}
 async registerScope(scope:RunScope):Promise<()=>void>{
  const store=await this.workspaces.storeFor(scope.workspaceId);await store.sessions.getSession(scope.sessionId);return store.bindScope(scope);
 }
 async authorizeScope(scope:RunScope):Promise<SessionRecord>{return(await this.workspaces.storeFor(scope.workspaceId)).authorizeScope(scope);}
 async setReadRevisions(scope:RunScope,revisions:Record<string,number>):Promise<RunScope>{return(await this.workspaces.storeFor(scope.workspaceId)).setReadRevisions(scope,revisions);}
 async completeOwnTurn(scope:RunScope,turn:CompletedTurn,signal?:AbortSignal):Promise<number>{const store=await this.workspaces.storeFor(scope.workspaceId);signal?.throwIfAborted();return store.sessions.completeOwnTurn(scope,turn,signal);}
 async getSession(workspaceId:WorkspaceId,sessionId:SessionId):Promise<SessionRecord>{return(await this.workspaces.storeFor(workspaceId)).sessions.getSession(sessionId);}
 async saveOwnSummary(scope:RunScope,summary:MemorySummary):Promise<void>{return(await this.workspaces.storeFor(scope.workspaceId)).sessions.saveOwnSummary(scope,summary);}
 async saveOwnToolState(scope:RunScope,state:Record<string,unknown>):Promise<void>{return(await this.workspaces.storeFor(scope.workspaceId)).sessions.saveOwnToolState(scope,state);}
 async getCommittedTurns(workspaceId:WorkspaceId,sessionId:SessionId,revision?:number):Promise<CommittedTurn[]>{return(await this.workspaces.storeFor(workspaceId)).sessions.getCommittedTurns(sessionId,revision);}
 async snapshot(workspaceId:WorkspaceId,sessionId:SessionId):Promise<SessionSnapshot>{return(await this.workspaces.storeFor(workspaceId)).sessions.snapshot(sessionId);}
}
