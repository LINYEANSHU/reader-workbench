import {z} from 'zod';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {AgentSettings} from '../../../contracts/src/agent-settings.js';
import {defaultAgentSettings} from '../../../contracts/src/agent-settings.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import type {WorkspaceService} from '../workspaces/service.js';
import {LocalSettings} from '../runtime/local-settings.js';
const schema=z.object({preset:z.enum(['professional','friendly','candid','efficient']),systemPrompt:z.string().min(1).max(16000),personalPrompt:z.string().max(16000),friendliness:z.enum(['enhanced','default','reduced']),enthusiasm:z.enum(['enhanced','default','reduced']),visualLayout:z.enum(['default','concise']),headingsLists:z.enum(['enhanced','default','concise'])}).strict();
export class AgentSettingsService{
 private settings:LocalSettings<AgentSettings|null>;
 constructor(private workspaces:WorkspaceService){this.settings=new LocalSettings(workspaces.configDir,'prompt-preferences',()=>null);}
 async get(workspaceId:WorkspaceId):Promise<AgentSettings>{
  const store=await this.workspaces.storeFor(workspaceId),legacy=store.getRecord<AgentSettings>('agent-settings','preferences');
  if(legacy){
   await new LocalSettings<Record<string,AgentSettings>>(this.workspaces.configDir,'legacy-prompt-preferences',()=>({})).update(current=>({...current,[workspaceId]:legacy}));
   await this.settings.update(current=>current??schema.parse(legacy));store.deleteRecord('agent-settings','preferences');
  }
  return await this.settings.get()??defaultAgentSettings();
 }
 async save(workspaceId:WorkspaceId,input:unknown):Promise<AgentSettings>{
  const result=schema.safeParse(input);if(!result.success||!result.data.systemPrompt.trim())throw new ReaderError('AGENT_SETTINGS_INVALID','提示词或表达选项无效，请检查内容和长度');
  const store=await this.workspaces.storeFor(workspaceId);await this.settings.update(()=>result.data);store.deleteRecord('agent-settings','preferences');return result.data;
 }
}
