import {z} from 'zod';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {AgentSettings} from '../../../contracts/src/agent-settings.js';
import {defaultAgentSettings} from '../../../contracts/src/agent-settings.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import type {WorkspaceService} from '../workspaces/service.js';
const schema=z.object({preset:z.enum(['professional','friendly','candid','efficient']),systemPrompt:z.string().min(1).max(16000),personalPrompt:z.string().max(16000),friendliness:z.enum(['enhanced','default','reduced']),enthusiasm:z.enum(['enhanced','default','reduced']),visualLayout:z.enum(['default','concise']),headingsLists:z.enum(['enhanced','default','concise'])}).strict();
export class AgentSettingsService{
 constructor(private workspaces:WorkspaceService){}
 async get(workspaceId:WorkspaceId):Promise<AgentSettings>{return(await this.workspaces.storeFor(workspaceId)).getRecord<AgentSettings>('agent-settings','preferences')??defaultAgentSettings();}
 async save(workspaceId:WorkspaceId,input:unknown):Promise<AgentSettings>{
  const result=schema.safeParse(input);if(!result.success||!result.data.systemPrompt.trim())throw new ReaderError('AGENT_SETTINGS_INVALID','提示词或表达选项无效，请检查内容和长度');
  (await this.workspaces.storeFor(workspaceId)).putRecord('agent-settings','preferences',result.data);return result.data;
 }
}
