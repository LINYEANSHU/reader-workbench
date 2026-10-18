export const MODEL_INPUT_TOKEN_LIMIT=1_000_000;
export interface ModelCapabilities {vision:boolean;tools:boolean;contextWindow:number;/** @deprecated Accepted for old settings and plugins; never limits output. */maxOutputTokens?:number;reasoningEfforts?:string[];defaultReasoningEffort?:string}
export function inputOnlyCapabilities(input:ModelCapabilities):ModelCapabilities{const{maxOutputTokens,...capabilities}=structuredClone(input);return{...capabilities,contextWindow:MODEL_INPUT_TOKEN_LIMIT};}
export interface ModelImageLimits {maxImages:number;maxImageBytes:number;maxTotalImageBytes:number;maxRequestBytes:number;imageTokens:number}
export type ModelContent={type:'text';text:string}|{type:'image_url';image_url:{url:string}};
export interface ModelToolCall {id:string;type:'function';function:{name:string;arguments:string}}
export interface ModelMessage {role:'system'|'user'|'assistant'|'tool';content:string|ModelContent[];tool_calls?:ModelToolCall[];tool_call_id?:string;reasoning_content?:string}
export interface ModelTool {type:'function';function:{name:string;description?:string;parameters:unknown}}
export interface ContextUsage {usedTokens:number;limit:number;estimated:boolean;capacitySource:'service'|'manual'|'application';/** Legacy field; new requests reserve no output tokens. */reservedOutputTokens:number}
export interface ModelRequest {messages:ModelMessage[];tools:ModelTool[];/** @deprecated Ignored; output length uses the provider default. */maxOutputTokens?:number;reasoningEffort?:string;usagePurpose?:'conversation'|'compaction';contextUsage?:ContextUsage;toolChoice?:'none'}
export type ModelEvent={kind:'delta';text:string}|{kind:'reasoning';text:string}|{kind:'tool-call';id:string;name:string;input:unknown}|{kind:'usage';inputTokens:number;outputTokens:number;cachedInputTokens?:number;uncachedInputTokens?:number}|{kind:'done'};
export interface ModelSettings {id:string;baseUrl:string;model:string;credentialRef:string;capabilities:ModelCapabilities;autoDiscoverContext?:boolean;imageLimits?:ModelImageLimits;ocrToolId?:string;reasoningFormat?:'openai'|'deepseek';requestTimeoutMs?:number}
export interface MaskedModelSettings extends ModelSettings {hasKey:boolean;migratedFrom?:string}
export interface ModelUsageRequest {
 at:string;inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;status:'completed'|'failed'|'cancelled';cachedInputTokens?:number|null;uncachedInputTokens?:number|null;context?:ContextUsage;
}
export interface ModelUsageSummary {
 modelId:string;model:string;trackedSince:string|null;requests:number;reportedRequests:number;missingUsageRequests:number;
 inputTokens:number;outputTokens:number;totalTokens:number;lastRequest:ModelUsageRequest|null;
 cachedInputTokens?:number;uncachedInputTokens?:number;cacheEligibleInputTokens?:number;cacheReportedRequests?:number;cacheHitRate?:number|null;
}
export interface SessionUsageSummary extends ModelUsageSummary {sessionId:string;context:ContextUsage|null}
export type WorkspaceUsageSummary=Omit<ModelUsageSummary,'modelId'|'model'>;
