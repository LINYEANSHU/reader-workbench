import {ResourceTemplate,type McpServer} from '@modelcontextprotocol/server';
import type {Actor,WorkspaceId,SessionId,DocumentId,DocumentVersion,ArtifactId} from '../../../../packages/contracts/src/ids.js';
import {authorizeWorkspace,authorizeSession,type ReaderServices} from './server.js';
import {ReaderError} from '../../../../packages/contracts/src/errors.js';
export async function readReaderResource(services:ReaderServices,actor:Actor,uri:string){
 const url=new URL(uri);if(url.protocol!=='reader:'||url.search||url.hash||url.username||url.password)throw new ReaderError('RESOURCE_INVALID','资源地址无效');
 const workspaceId=url.hostname as WorkspaceId;await authorizeWorkspace(services,workspaceId,actor);
 const parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);let result:unknown;
 if(parts[0]==='sessions'&&parts.length===2){await authorizeSession(services,workspaceId,parts[1] as SessionId,actor);result=await services.sessions.getHistory(workspaceId,parts[1] as SessionId);}
 else if(parts[0]==='artifacts'&&parts.length===2){const artifact=await services.artifacts.get(workspaceId,parts[1] as ArtifactId);await authorizeSession(services,workspaceId,artifact.sessionId,actor);result=artifact;}
 else if(parts[0]==='documents'&&parts[3]==='pages'&&parts.length===5){const pageNumber=Number(parts[4]);if(!Number.isSafeInteger(pageNumber)||pageNumber<1)throw new ReaderError('PAGE_UNAVAILABLE','页码无效');const {imagePath,...page}=await services.documents.readPage({workspaceId,documentId:parts[1] as DocumentId,version:parts[2] as DocumentVersion},pageNumber);result={...page,hasImage:Boolean(imagePath)};}
 else throw new ReaderError('RESOURCE_UNAVAILABLE','资源不存在',404);
 return{contents:[{uri,mimeType:'application/json',text:JSON.stringify(result)}]};
}
export function registerReaderResources(server:McpServer,services:ReaderServices,actor:Actor){
 for(const [name,template] of Object.entries({document_page:'reader://{workspaceId}/documents/{documentId}/{version}/pages/{page}',session_history:'reader://{workspaceId}/sessions/{sessionId}',artifact:'reader://{workspaceId}/artifacts/{artifactId}'}))server.registerResource(name,new ResourceTemplate(template,{list:undefined}),{mimeType:'application/json'},uri=>readReaderResource(services,actor,uri.href));
}
