import {AsyncLocalStorage} from 'node:async_hooks';
import type {WorkspaceId,SessionId,RunId} from '../../../contracts/src/ids.js';
export interface ModelUsageScope {workspaceId:WorkspaceId;sessionId:SessionId;runId:RunId;epoch:number}
export const modelUsageScope=new AsyncLocalStorage<ModelUsageScope>();
