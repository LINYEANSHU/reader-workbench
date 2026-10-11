import type {Actor,WorkspaceId,SessionId,RunScope} from './ids.js';
import type {SourceAnchor,SelectionContext} from './documents.js';
export type ToolEffect='read'|'write_artifact'|'write_session'|'external_write';
export interface ToolResult {content:string;sourceAnchors?:SourceAnchor[];artifactIds?:string[];data?:unknown}
export interface ToolDefinition {name:string;description?:string;inputSchema:unknown;effect:ToolEffect;execute(input:unknown,scope:RunScope,signal:AbortSignal):Promise<ToolResult>}
export interface ActionScope {actor:Actor;workspaceId:WorkspaceId;sessionId:SessionId;selection?:SelectionContext}
export interface ActionResult {message?:string;selection?:SelectionContext;target?:'temporary';data?:unknown}
export interface SelectionActionResult extends ActionResult {target:'temporary'}
export interface ProcessToolSpec {command:string;args:string[];tool:Omit<ToolDefinition,'execute'>;timeoutMs:number}
export interface ExternalMcpConfig {id:string;transport:'stdio'|'http';command?:string;args?:string[];url?:string;credentialRef?:string;effects:Record<string,ToolEffect>}
