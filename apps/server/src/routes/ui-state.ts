import type {FastifyInstance} from 'fastify';
import type {WorkspaceService} from '../../../../packages/core/src/workspaces/service.js';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import type {UiState} from '../../../../packages/contracts/src/ui-state.js';
export function uiStateRoutes(app:FastifyInstance,service:WorkspaceService){
  app.get<{Params:{clientId:string};Querystring:{workspaceId:WorkspaceId}}>('/api/v1/ui-state/:clientId',request=>service.getUiState(request.query.workspaceId,request.params.clientId));
  app.put<{Params:{clientId:string};Body:{workspaceId:WorkspaceId;state:UiState}}>('/api/v1/ui-state/:clientId',async request=>{await service.saveUiState(request.body.workspaceId,request.params.clientId,request.body.state);return {saved:true};});
}
