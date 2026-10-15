import {z} from 'zod';
import type {ModelSettings,MaskedModelSettings,ModelCapabilities,ModelUsageRequest,ModelUsageSummary,SessionUsageSummary,WorkspaceUsageSummary} from '../../../contracts/src/models.js';import type {WorkspaceId,SessionId} from '../../../contracts/src/ids.js';
import {modelUsageScope} from './usage-scope.js';import {metadataContextWindow} from './metadata.js';
import {createHash} from 'node:crypto';
import type {WorkspaceService} from '../workspaces/service.js';import type {CapabilityRegistry} from '../plugins/registry.js';
import {CredentialStore} from '../runtime/credentials.js';import {OpenAICompatibleProvider,completionUrl} from './openai-compatible.js';import {KeyedQueue} from '../runs/queue.js';import {ReaderError} from '../../../contracts/src/errors.js';
const imageLimitsSchema=z.object({maxImages:z.number().int().min(1).max(600),maxImageBytes:z.number().int().min(1).max(64*1024*1024),maxTotalImageBytes:z.number().int().min(1).max(200*1024*1024),maxRequestBytes:z.number().int().min(1024).max(256*1024*1024),imageTokens:z.number().int().min(1).max(32768)}).strict();
export const modelSettingsSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),baseUrl:z.string().max(2000),model:z.string().min(1).max(200),credentialRef:z.string().max(128),autoDiscoverContext:z.boolean().optional(),capabilities:z.object({vision:z.boolean(),tools:z.boolean(),contextWindow:z.number().int().min(1024).max(4000000),maxOutputTokens:z.number().int().min(1).max(1000000),reasoningEfforts:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/)).max(16).optional(),defaultReasoningEffort:z.string().max(32).optional()}),ocrToolId:z.string().max(100).optional(),reasoningFormat:z.enum(['openai','deepseek']).optional(),imageLimits:imageLimitsSchema.optional(),requestTimeoutMs:z.number().int().min(1000).max(3600000).optional()});
export class ModelSettingsService{
 readonly credentials:CredentialStore;private loaded=new Map<string,string>();private releases=new Map<string,()=>void>();private queue=new KeyedQueue();
 constructor(private workspaces:WorkspaceService,private capabilities:CapabilityRegistry){this.credentials=new CredentialStore(workspaces.configDir);}
 private validate(settings:ModelSettings):ModelSettings{
  const result=modelSettingsSchema.safeParse(settings);if(!result.success)throw new ReaderError('MODEL_SETTINGS_INVALID','模型设置无效');completionUrl(result.data.baseUrl);
  const cap=result.data.capabilities;if(cap.maxOutputTokens>=cap.contextWindow||cap.defaultReasoningEffort&&!cap.reasoningEfforts?.includes(cap.defaultReasoningEffort))throw new ReaderError('MODEL_SETTINGS_INVALID','输出容量或默认思考档位无效');
  if(result.data.id==='demo'||result.data.id.startsWith('core.'))throw new ReaderError('MODEL_SETTINGS_INVALID','此模型标识由系统保留');return result.data;
 }
 private register(workspaceId:WorkspaceId,settings:ModelSettings){
  const name=workspaceId+'/'+settings.id,signature=JSON.stringify(settings);if(this.loaded.get(name)===signature)return;
  const pinned=structuredClone(settings);
  this.releases.get(name)?.();this.releases.set(name,this.capabilities.register(workspaceId,'model',settings.id,new OpenAICompatibleProvider(settings,this.credentials,(report,startedAt)=>this.recordUsage(workspaceId,pinned,report,startedAt)),'model.'+settings.id));this.loaded.set(name,signature);
 }
 private usageKey(settings:ModelSettings){return createHash('sha256').update(JSON.stringify([settings.id,completionUrl(settings.baseUrl),settings.model])).digest('hex');}
 private emptyUsage(settings:ModelSettings):ModelUsageSummary{return{modelId:settings.id,model:settings.model,trackedSince:null,requests:0,reportedRequests:0,missingUsageRequests:0,inputTokens:0,outputTokens:0,totalTokens:0,lastRequest:null,cachedInputTokens:0,uncachedInputTokens:0,cacheEligibleInputTokens:0,cacheReportedRequests:0,cacheHitRate:null};}
 private addUsage(summary:ModelUsageSummary,report:ModelUsageRequest,startedAt:string){
  summary.trackedSince=summary.trackedSince&&summary.trackedSince<startedAt?summary.trackedSince:startedAt;summary.requests++;
  if(report.inputTokens!==null&&report.outputTokens!==null){summary.reportedRequests++;summary.inputTokens+=report.inputTokens;summary.outputTokens+=report.outputTokens;summary.totalTokens=summary.inputTokens+summary.outputTokens;}else summary.missingUsageRequests++;
  if(report.cachedInputTokens!=null&&report.uncachedInputTokens!=null&&report.inputTokens!==null){
   summary.cachedInputTokens=(summary.cachedInputTokens??0)+report.cachedInputTokens;summary.uncachedInputTokens=(summary.uncachedInputTokens??0)+report.uncachedInputTokens;summary.cacheEligibleInputTokens=(summary.cacheEligibleInputTokens??0)+report.inputTokens;summary.cacheReportedRequests=(summary.cacheReportedRequests??0)+1;
  }
  summary.cacheHitRate=summary.cacheEligibleInputTokens?summary.cachedInputTokens!/summary.cacheEligibleInputTokens:null;
  if(!summary.lastRequest||summary.lastRequest.at<=report.at)summary.lastRequest=report;
 }
 private sessionUsageKey(settings:ModelSettings,sessionId:SessionId,epoch:number){return this.usageKey(settings)+'/'+sessionId+'/'+epoch;}
 private async recordUsage(workspaceId:WorkspaceId,settings:ModelSettings,report:ModelUsageRequest,startedAt:string){
  const scope=modelUsageScope.getStore();
  await this.queue.enqueue(workspaceId,async()=>{
   const store=await this.workspaces.storeFor(workspaceId),key=this.usageKey(settings),summary=store.getRecord<ModelUsageSummary>('model-usage',key)??this.emptyUsage(settings);
   this.addUsage(summary,report,startedAt);
   store.putRecord('model-usage',key,summary);
   if(scope?.workspaceId===workspaceId){
    const sessionKey=this.sessionUsageKey(settings,scope.sessionId,scope.epoch),session=store.getRecord<SessionUsageSummary>('session-usage',sessionKey)??{...this.emptyUsage(settings),sessionId:scope.sessionId,context:null};
    this.addUsage(session,report,startedAt);if(report.context)session.context=report.context;store.putRecord('session-usage',sessionKey,session);
   }
  });
 }
 async sessionUsage(workspaceId:WorkspaceId,sessionId:SessionId,id:string):Promise<SessionUsageSummary>{
  const settings=(await this.listModelSettings(workspaceId)).find(model=>model.id===id);if(!settings)throw new ReaderError('MODEL_UNAVAILABLE','此工作区未保存该模型连接',404);
  const store=await this.workspaces.storeFor(workspaceId),session=await store.sessions.getSession(sessionId);
  return store.getRecord<SessionUsageSummary>('session-usage',this.sessionUsageKey(settings,sessionId,session.epoch??0))??{...this.emptyUsage(settings),sessionId,context:null};
 }
 async workspaceUsage(workspaceId:WorkspaceId):Promise<WorkspaceUsageSummary>{
  return this.queue.enqueue(workspaceId,async()=>{
   const store=await this.workspaces.storeFor(workspaceId);
   const total:WorkspaceUsageSummary={trackedSince:null,requests:0,reportedRequests:0,missingUsageRequests:0,inputTokens:0,outputTokens:0,totalTokens:0,lastRequest:null,cachedInputTokens:0,uncachedInputTokens:0,cacheEligibleInputTokens:0,cacheReportedRequests:0,cacheHitRate:null};
   // Each provider request is recorded once here; session summaries are a separate index.
   for(const usage of store.listRecords<ModelUsageSummary>('model-usage')){
    total.requests+=usage.requests;total.reportedRequests+=usage.reportedRequests;total.missingUsageRequests+=usage.missingUsageRequests;
    total.inputTokens+=usage.inputTokens;total.outputTokens+=usage.outputTokens;total.totalTokens+=usage.totalTokens;
    total.cachedInputTokens!+=usage.cachedInputTokens??0;total.uncachedInputTokens!+=usage.uncachedInputTokens??0;
    total.cacheEligibleInputTokens!+=usage.cacheEligibleInputTokens??0;total.cacheReportedRequests!+=usage.cacheReportedRequests??0;
    if(usage.trackedSince&&(!total.trackedSince||usage.trackedSince<total.trackedSince))total.trackedSince=usage.trackedSince;
    if(usage.lastRequest&&(!total.lastRequest||usage.lastRequest.at>=total.lastRequest.at))total.lastRequest=usage.lastRequest;
   }
   total.cacheHitRate=total.cacheEligibleInputTokens?total.cachedInputTokens!/total.cacheEligibleInputTokens:null;
   return total;
  });
 }
 async usage(workspaceId:WorkspaceId,id:string):Promise<ModelUsageSummary>{
  const settings=(await this.listModelSettings(workspaceId)).find(model=>model.id===id);
  if(!settings)throw new ReaderError('MODEL_UNAVAILABLE','此工作区未保存该模型连接',404);
  const store=await this.workspaces.storeFor(workspaceId);return store.getRecord<ModelUsageSummary>('model-usage',this.usageKey(settings))??this.emptyUsage(settings);
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
