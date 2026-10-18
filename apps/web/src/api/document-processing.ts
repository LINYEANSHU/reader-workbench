import type {DocumentProcessingRequest,DocumentProcessingTask} from '../../../../packages/contracts/src/document-processing.js';
import type {ArtifactRecord} from '../../../../packages/contracts/src/artifacts.js';
import type {SessionId,WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import {api} from './client.js';

const base=(workspaceId:WorkspaceId)=>'/workspaces/'+workspaceId+'/document-processing';
const path=(task:DocumentProcessingTask)=>base(task.document.workspaceId)+'/'+encodeURIComponent(task.id);
export const documentProcessing={
 start:(request:DocumentProcessingRequest)=>api.request<DocumentProcessingTask>(base(request.document.workspaceId),{method:'POST',body:request}),
 get:(task:DocumentProcessingTask,signal?:AbortSignal)=>api.request<DocumentProcessingTask>(path(task)+'?sessionId='+encodeURIComponent(task.sessionId),{signal}),
 cancel:(task:DocumentProcessingTask)=>api.request<DocumentProcessingTask>(path(task)+'/cancel',{method:'POST',body:{sessionId:task.sessionId}}),
 save:(task:DocumentProcessingTask,name?:string)=>api.request<ArtifactRecord>(path(task)+'/save',{method:'POST',body:{sessionId:task.sessionId,...(name?{name}:{})}}),
 previewUrl:(task:DocumentProcessingTask)=>'/api/v1'+path(task)+'/preview?sessionId='+encodeURIComponent(task.sessionId)
};

export type ProcessingIdentity={workspaceId:WorkspaceId;sessionId:SessionId};
