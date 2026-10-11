export interface ModelCapabilities {vision:boolean;tools:boolean;contextWindow:number;maxOutputTokens:number}
export type ModelContent={type:'text';text:string}|{type:'image_url';image_url:{url:string}};
export interface ModelToolCall {id:string;type:'function';function:{name:string;arguments:string}}
export interface ModelMessage {role:'system'|'user'|'assistant'|'tool';content:string|ModelContent[];tool_calls?:ModelToolCall[];tool_call_id?:string}
export interface ModelTool {type:'function';function:{name:string;description?:string;parameters:unknown}}
export interface ModelRequest {messages:ModelMessage[];tools:ModelTool[];maxOutputTokens:number}
export type ModelEvent={kind:'delta';text:string}|{kind:'tool-call';id:string;name:string;input:unknown}|{kind:'usage';inputTokens:number;outputTokens:number}|{kind:'done'};
export interface ModelSettings {id:string;baseUrl:string;model:string;credentialRef:string;capabilities:ModelCapabilities;ocrToolId?:string}
export interface MaskedModelSettings extends ModelSettings {hasKey:boolean}
