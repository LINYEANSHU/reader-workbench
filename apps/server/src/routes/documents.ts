import type {FastifyInstance,FastifyReply} from 'fastify';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import type {DocumentService} from '../../../../packages/core/src/documents/service.js';
import type {DocumentRef} from '../../../../packages/contracts/src/documents.js';
import type {WorkspaceId,DocumentId,DocumentVersion} from '../../../../packages/contracts/src/ids.js';
import {ReaderError} from '../../../../packages/contracts/src/errors.js';
import {mimeFor} from '../../../../packages/core/src/documents/versions.js';
interface VersionRequest {Params:{id:DocumentId;version:DocumentVersion};Querystring:{workspaceId:WorkspaceId;q?:string;limit?:string;path?:string}}
export async function sendDocumentFile(reply:FastifyReply,path:string,mime:string,range?:string){
  const info=await stat(path);reply.header('x-content-type-options','nosniff').header('content-security-policy',"default-src 'none'; sandbox").type(mime);
  if(range){
    const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match)throw new ReaderError('INVALID_RANGE','无效的字节范围',416);
    const start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));
    const end=match[1]?(match[2]?Math.min(Number(match[2]),info.size-1):info.size-1):info.size-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size)throw new ReaderError('INVALID_RANGE','字节范围超出文件',416);
    reply.code(206).header('accept-ranges','bytes').header('content-range','bytes '+start+'-'+end+'/'+info.size).header('content-length',end-start+1);
    return reply.send(createReadStream(path,{start,end}));
  }
  return reply.header('accept-ranges','bytes').header('content-length',info.size).send(createReadStream(path));
}
export function documentRoutes(app:FastifyInstance,documents:DocumentService){
  const ref=(request:{params:VersionRequest['Params'];query:VersionRequest['Querystring']}):DocumentRef=>({workspaceId:request.query.workspaceId,documentId:request.params.id,version:request.params.version});
  app.post<{Params:{id:WorkspaceId};Body:{relativePath:string}}>('/api/v1/workspaces/:id/documents/open',async(request,reply)=>{
    if(typeof request.body?.relativePath!=='string')throw new ReaderError('INVALID_ARGUMENT','需要工作区相对路径');
    reply.code(202);return documents.open(request.params.id,request.body.relativePath,new AbortController().signal);
  });
  app.post<{Params:{id:WorkspaceId};Body:{name:string;bytesBase64:string}}>('/api/v1/workspaces/:id/documents/import',async(request,reply)=>{
    if(typeof request.body?.name!=='string'||typeof request.body?.bytesBase64!=='string')throw new ReaderError('INVALID_ARGUMENT','需要文件名称和内容');
    reply.code(202);return documents.import(request.params.id,request.body.name,Buffer.from(request.body.bytesBase64,'base64'),new AbortController().signal);
  });
  app.get<{Params:{id:WorkspaceId}}>('/api/v1/workspaces/:id/documents',request=>documents.list(request.params.id));
  const prefix='/api/v1/documents/:id/versions/:version';
  app.get<VersionRequest>(prefix,request=>documents.get(ref(request)));
  for(const mode of ['content','preview']){
    app.get<VersionRequest>(prefix+'/'+mode,async(request,reply)=>{
      const file=await documents.content(ref(request),mode==='preview');
      if(mode==='content'&&!['text/markdown','text/plain','application/pdf','image/png','image/jpeg','image/webp'].includes(file.mime))reply.header('content-disposition','attachment');
      return sendDocumentFile(reply,file.path,file.mime,request.headers.range);
    });
  }
  app.get<VersionRequest&{Params:VersionRequest['Params']&{page:string}}>(prefix+'/pages/:page',async request=>{
    const {imagePath,...page}=await documents.readPage(ref(request),Number(request.params.page));return {...page,hasImage:Boolean(imagePath)};
  });
  app.get<VersionRequest&{Params:VersionRequest['Params']&{page:string}}>(prefix+'/pages/:page/image',async(request,reply)=>{
    const page=await documents.readPage(ref(request),Number(request.params.page));
    if(!page.imagePath)throw new ReaderError('PAGE_IMAGE_UNAVAILABLE','此页没有图像预览',404);
    return sendDocumentFile(reply,await documents.authorizedFile(ref(request),page.imagePath),mimeFor(page.imagePath));
  });
  app.get<VersionRequest&{Params:VersionRequest['Params']&{blockId:string}}>(prefix+'/blocks/:blockId',request=>documents.readBlock(ref(request),request.params.blockId));
  app.get<VersionRequest>(prefix+'/search',request=>documents.search(ref(request),request.query.q??'',Number(request.query.limit??20)));
  app.get<VersionRequest>(prefix+'/resources',async(request,reply)=>{const resource=await documents.resource(ref(request),request.query.path??'');return sendDocumentFile(reply,resource.path,resource.mime);});
}
