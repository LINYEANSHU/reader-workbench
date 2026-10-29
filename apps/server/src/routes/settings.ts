import type {FastifyInstance} from 'fastify';import type {ModelSettingsService} from '../../../../packages/core/src/models/settings.js';import type {ModelSettings} from '../../../../packages/contracts/src/models.js';import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';import {ReaderError} from '../../../../packages/contracts/src/errors.js';
import type {AgentSettingsService} from '../../../../packages/core/src/sessions/agent-settings.js';import type {SessionId} from '../../../../packages/contracts/src/ids.js';
export function settingsRoutes(app:FastifyInstance,models:ModelSettingsService,agents:AgentSettingsService){
 const path='/api/v1/workspaces/:id/settings/models';
 app.get<{Params:{id:WorkspaceId}}>(path,request=>models.listModelSettings(request.params.id));
 app.put<{Params:{id:WorkspaceId};Body:{settings:ModelSettings;key?:string;create?:boolean}}>(path,request=>{if(!request.body?.settings)throw new ReaderError('MODEL_SETTINGS_INVALID','请提供模型设置');return models.saveModelSettings(request.params.id,request.body.settings,request.body.key,{create:request.body.create===true});});
 app.get<{Params:{id:WorkspaceId;modelId:string}}>(path+'/:modelId/catalog',request=>models.discover(request.params.id,request.params.modelId));
 app.get<{Params:{id:WorkspaceId;modelId:string}}>(path+'/:modelId/usage',request=>models.usage(request.params.id,request.params.modelId));
 app.get<{Params:{id:WorkspaceId}}>('/api/v1/workspaces/:id/usage',request=>models.workspaceUsage(request.params.id));
 app.get<{Params:{id:WorkspaceId}}>('/api/v1/workspaces/:id/settings/agent',request=>agents.get(request.params.id));
 app.put<{Params:{id:WorkspaceId}}>('/api/v1/workspaces/:id/settings/agent',request=>agents.save(request.params.id,request.body));
 app.get<{Params:{id:WorkspaceId;sessionId:SessionId};Querystring:{providerId:string}}>('/api/v1/workspaces/:id/sessions/:sessionId/usage',request=>models.sessionUsage(request.params.id,request.params.sessionId,request.query.providerId));
}
