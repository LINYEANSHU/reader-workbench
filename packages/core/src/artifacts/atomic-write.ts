import {open,link,unlink,mkdir,realpath,lstat} from 'node:fs/promises';
import {join,basename,extname} from 'node:path';import {randomUUID} from 'node:crypto';
import type {WorkspaceService} from '../workspaces/service.js';import type {RunScope} from '../../../contracts/src/ids.js';import {ReaderError} from '../../../contracts/src/errors.js';
export async function atomicWrite(workspaces:WorkspaceService,scope:RunScope,name:string,extension:string,bytes:Uint8Array,signal:AbortSignal):Promise<{relativePath:string;rollback:()=>Promise<void>}>{
 const workspace=await workspaces.get(scope.workspaceId),base=scope.outputDirectory??'outputs',directory=base+'/'+scope.sessionId;
 if(!/^[a-zA-Z0-9_-]+$/.test(scope.sessionId))throw new ReaderError('TOOL_SCOPE_DENIED','会话输出目录无效',403);
 const segments=directory.split('/'),parts=segments.map((_part,index)=>segments.slice(0,index+1).join('/'));
 for(const part of parts){const expected=join(workspace.root,part),guarded=await workspaces.resolvePath(scope.workspaceId,part,'create');if(guarded!==expected)throw new ReaderError('PATH_OUTSIDE_WORKSPACE','输出目录不能被链接重定向',403);try{if((await lstat(expected)).isSymbolicLink())throw new ReaderError('PATH_OUTSIDE_WORKSPACE','输出目录不能是链接',403);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}await mkdir(expected,{recursive:true});if(await realpath(expected)!==expected)throw new ReaderError('PATH_OUTSIDE_WORKSPACE','输出目录路径异常',403);}
 const temporary=join(workspace.root,directory,'.reader-tmp-'+randomUUID());let published:string|undefined;
 try{
  signal.throwIfAborted();const file=await open(temporary,'wx',0o600);try{await file.writeFile(bytes,{signal});await file.sync();}finally{await file.close();}
  const requestedExtension=extname(name),stem=requestedExtension.toLowerCase()===extension.toLowerCase()?basename(name,requestedExtension):name;
  for(let attempt=0;attempt<100;attempt++){
   signal.throwIfAborted();const relativePath=directory+'/'+stem+(attempt?' ('+attempt+')':'')+extension,path=await workspaces.resolvePath(scope.workspaceId,relativePath,'create');
   try{await link(temporary,path);published=path;signal.throwIfAborted();return{relativePath,rollback:()=>unlink(path)};}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')continue;throw error;}
  }
  throw new ReaderError('ARTIFACT_NAME_LIMIT','同名输出过多，请更换名称');
 }catch(error){if(published)await unlink(published).catch(()=>{});throw error;}finally{await unlink(temporary).catch(()=>{});}
}
