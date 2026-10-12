import {z} from 'zod';
import type {ModelSettings,MaskedModelSettings,ModelCapabilities} from '../../../contracts/src/models.js';import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {WorkspaceService} from '../workspaces/service.js';import type {CapabilityRegistry} from '../plugins/registry.js';
import {CredentialStore} from '../runtime/credentials.js';import {OpenAICompatibleProvider,completionUrl} from './openai-compatible.js';import {KeyedQueue} from '../runs/queue.js';import {ReaderError} from '../../../contracts/src/errors.js';
const imageLimitsSchema=z.object({maxImages:z.number().int().min(1).max(600),maxImageBytes:z.number().int().min(1).max(64*1024*1024),maxTotalImageBytes:z.number().int().min(1).max(200*1024*1024),maxRequestBytes:z.number().int().min(1024).max(256*1024*1024),imageTokens:z.number().int().min(1).max(32768)}).strict();
export const modelSettingsSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),baseUrl:z.string().max(2000),model:z.string().min(1).max(200),credentialRef:z.string().max(128),capabilities:z.object({vision:z.boolean(),tools:z.boolean(),contextWindow:z.number().int().min(1024).max(4000000),maxOutputTokens:z.number().int().min(1).max(1000000),reasoningEfforts:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/)).max(16).optional(),defaultReasoningEffort:z.string().max(32).optional()}),ocrToolId:z.string().max(100).optional(),reasoningFormat:z.enum(['openai','deepseek']).optional(),requestTimeoutMs:z.number().int().min(1000).max(3600000).optional()});
export class ModelSettingsService{
 readonly credentials:CredentialStore;private loaded=new Map<string,string>();private releases=new Map<string,()=>void>();private queue=new KeyedQueue();
 constructor(private workspaces:WorkspaceService,private capabilities:CapabilityRegistry){this.credentials=new CredentialStore(workspaces.configDir);}
 private validate(settings:ModelSettings):ModelSettings{
  const result=modelSettingsSchema.extend({imageLimits:imageLimitsSchema.optional()}).safeParse(settings);if(!result.success)throw new ReaderError('MODEL_SETTINGS_INVALID','模型设置无效');completionUrl(result.data.baseUrl);
  const cap=result.data.capabilities;if(cap.maxOutputTokens>=cap.contextWindow||cap.defaultReasoningEffort&&!cap.reasoningEfforts?.includes(cap.defaultReasoningEffort))throw new ReaderError('MODEL_SETTINGS_INVALID','输出容量或默认思考档位无效');
  if(result.data.id==='demo'||result.data.id.startsWith('core.'))throw new ReaderError('MODEL_SETTINGS_INVALID','此模型标识由系统保留');return result.data;
 }
 private register(workspaceId:WorkspaceId,settings:ModelSettings){
  const name=workspaceId+'/'+settings.id,signature=JSON.stringify(settings);if(this.loaded.get(name)===signature)return;
  this.releases.get(name)?.();this.releases.set(name,this.capabilities.register(workspaceId,'model',settings.id,new OpenAICompatibleProvider(settings,this.credentials),'model.'+settings.id));this.loaded.set(name,signature);
 }
 async saveModelSettings(workspaceId:WorkspaceId,input:ModelSettings,key?:string):Promise<MaskedModelSettings>{
  return this.queue.enqueue(workspaceId,async()=>{
   const settings=this.validate(input),credentialRef='model.'+workspaceId+'.'+settings.id;
   if(key!==undefined&&(typeof key!=='string'||!key.trim()||key.length>16000))throw new ReaderError('INVALID_CREDENTIAL','API Key 无效');
   if(settings.credentialRef&&settings.credentialRef!==credentialRef)throw new ReaderError('INVALID_CREDENTIAL','凭据引用不属于此工作区模型');
   settings.credentialRef=credentialRef;const store=await this.workspaces.storeFor(workspaceId);if(key!==undefined)await this.credentials.setSecret(credentialRef,key.trim());store.putRecord('model-settings',settings.id,settings);
   this.loaded.delete(workspaceId+'/'+settings.id);this.register(workspaceId,settings);return{...settings,hasKey:await this.credentials.hasSecret(credentialRef)};
  });
 }
 async listModelSettings(workspaceId:WorkspaceId):Promise<MaskedModelSettings[]>{
  return this.queue.enqueue(workspaceId,async()=>{
   const store=await this.workspaces.storeFor(workspaceId),settings=store.listRecords<ModelSettings>('model-settings');const result:MaskedModelSettings[]=[];
   for(const entry of settings){const valid=this.validate(entry);if(valid.credentialRef!=='model.'+workspaceId+'.'+valid.id)throw new ReaderError('INVALID_CREDENTIAL','模型凭据引用归属无效');this.register(workspaceId,valid);result.push({...valid,hasKey:await this.credentials.hasSecret(valid.credentialRef)});}return result;
  });
 }
 async loadRecent(){for(const workspace of await this.workspaces.listRecent({callerId:'local-owner',transport:'internal'})){try{await this.listModelSettings(workspace.id);}catch{/* Unavailable recent folders do not prevent opening another workspace. */}}}
 async discover(workspaceId:WorkspaceId,id:string):Promise<Array<{id:string;capabilities?:ModelCapabilities}>>{
  const settings=(await this.listModelSettings(workspaceId)).find(entry=>entry.id===id);if(!settings)throw new ReaderError('MODEL_UNAVAILABLE','请先保存服务地址与 API Key',404);const key=await this.credentials.getSecret(settings.credentialRef);
  const url=new URL(settings.baseUrl);url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'')+'/models';let response:Response;
  try{response=await fetch(url,{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new ReaderError('MODEL_CONNECTION_FAILED','无法读取模型列表',502,true);}
  if(!response.ok)throw new ReaderError(response.status===401?'MODEL_AUTHENTICATION_FAILED':'MODEL_API_ERROR','无法读取模型列表（HTTP '+response.status+'）',502);
  const data=await response.json() as {data?:Array<{id:string;context_length?:number;max_output_tokens?:number;input_modalities?:string[];effort?:{supported_levels?:string[];default_level?:string}}>};
  return(data.data??[]).slice(0,500).filter(item=>typeof item.id==='string').map(item=>({id:item.id.slice(0,200),...(item.context_length&&item.max_output_tokens?{capabilities:{vision:item.input_modalities?.includes('image')??false,tools:settings.capabilities.tools,contextWindow:item.context_length,maxOutputTokens:item.max_output_tokens,...(item.effort?.supported_levels?{reasoningEfforts:['none',...item.effort.supported_levels],defaultReasoningEffort:item.effort.default_level}:{})}}:{})}));
 }
}
