import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import type {WorkspaceService} from '../workspaces/service.js';
import type {WorkspaceId,DocumentId,DocumentVersion} from '../../../contracts/src/ids.js';
import type {VersionedFile} from '../../../contracts/src/documents.js';
import {ReaderError} from '../../../contracts/src/errors.js';
const types:Record<string,string>={'.md':'text/markdown','.markdown':'text/markdown','.txt':'text/plain','.pdf':'application/pdf','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
export function mimeFor(path:string){return types[extname(path).toLowerCase()]??'application/octet-stream';}
export async function safeCacheDirectory(workspaces:WorkspaceService,id:WorkspaceId,segments:string[]):Promise<string>{
  let directory=await workspaces.internalDirectory(id);
  if((await lstat(directory)).isSymbolicLink())throw new ReaderError('PATH_OUTSIDE_WORKSPACE','内部缓存不能指向链接',403);
  for(const segment of segments){if(!/^[a-zA-Z0-9._-]+$/.test(segment)||segment==='..')throw new ReaderError('PATH_OUTSIDE_WORKSPACE','缓存路径无效',403);
    directory=join(directory,segment);try{if((await lstat(directory)).isSymbolicLink())throw new ReaderError('PATH_OUTSIDE_WORKSPACE','缓存不能指向链接',403);}
    catch(error){if(error instanceof ReaderError)throw error;if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    await mkdir(directory,{recursive:true});}
  return directory;
}
export async function snapshot(workspaces:WorkspaceService,id:WorkspaceId,relativePath:string,signal:AbortSignal):Promise<VersionedFile>{
  const source=await workspaces.resolvePath(id,relativePath,'read');
  const bytes=await readFile(source,{signal});if(bytes.length>256*1024*1024)throw new ReaderError('DOCUMENT_TOO_LARGE','文档超过 256 MiB，请拆分后读取');
  const version=createHash('sha256').update(bytes).digest('hex') as DocumentVersion;
  const documentId=createHash('sha256').update(relativePath.replaceAll('\\','/')).digest('hex').slice(0,24) as DocumentId;
  const extension=extname(relativePath).toLowerCase();const cacheDir=await safeCacheDirectory(workspaces,id,['cache',documentId,version]);
  const path=join(cacheDir,'source'+extension);
  try{await writeFile(path,bytes,{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    if((await lstat(path)).isSymbolicLink()||createHash('sha256').update(await readFile(path)).digest('hex')!==version)throw new ReaderError('CACHE_INVALID','源版本缓存校验失败');}
  return {workspaceId:id,documentId,version,path,cacheDir,mime:mimeFor(relativePath),extension,relativePath};
}
