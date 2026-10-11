import type { WorkspaceId } from './ids.js';
export interface WorkspaceStore {workspaceId:WorkspaceId;close():Promise<void>}
