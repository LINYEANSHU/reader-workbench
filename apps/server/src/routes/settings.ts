import type {FastifyInstance} from 'fastify';import type {ModelSettingsService} from '../../../../packages/core/src/models/settings.js';import type {ModelSettings} from '../../../../packages/contracts/src/models.js';import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';import {ReaderError} from '../../../../packages/contracts/src/errors.js';
export function settingsRoutes(app:FastifyInstance,models:ModelSettingsService){
 const path='/api/v1/workspaces/:id/settings/models';
 app.get<{Params:{id:WorkspaceId}}>(path,request=>models.listModelSettings(request.params.id));
 app.put<{Params:{id:WorkspaceId};Body:{settings:ModelSettings;key?:string}}>(path,request=>{if(!request.body?.settings)throw new ReaderError('MODEL_SETTINGS_INVALID','请提供模型设置');return models.saveModelSettings(request.params.id,request.body.settings,request.body.key);});
 app.get<{Params:{id:WorkspaceId;modelId:string}}>(path+'/:modelId/catalog',request=>models.discover(request.params.id,request.params.modelId));
}
