import {mkdtemp,realpath,rmdir,symlink,unlink} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {ReaderError} from '../../../contracts/src/errors.js';
import {runProcess} from '../runtime/process.js';

export interface NativeRoot {path:string;close:()=>Promise<void>}
const ascii=(value:string)=>/^[\x00-\x7f]+$/.test(value);

// Ladybug's Windows native path conversion uses the active ANSI code page,
// even for a relative database path when the working directory is Unicode.
// A private, short-lived junction gives it an ASCII working-directory spelling
// while every database byte remains in the validated workspace cache.
export async function createNativeRoot(root:string,temporaryRoot=tmpdir()):Promise<NativeRoot>{
 if(process.platform!=='win32'||ascii(root))return{path:root,close:async()=>{}};
 const target=await realpath(root);
 const systemRoot=process.env.SystemRoot??process.env.WINDIR;
 if(!systemRoot||!isAbsolute(systemRoot))throw new ReaderError('WORKSPACE_MEMORY_UNAVAILABLE','无法为本地记忆创建受保护的临时目录，请检查 Windows 临时目录权限');
 const candidates=[temporaryRoot,...(systemRoot?[join(systemRoot,'Temp')]:[])];
 for(const candidate of [...new Set(candidates)]){
  if(!isAbsolute(candidate)||!ascii(candidate))continue;
  let directory:string|undefined,linked=false;
  try{
   directory=await mkdtemp(join(resolve(candidate),'reader-cognee-native-'));
   const signal=new AbortController().signal;
   const identity=await runProcess(join(systemRoot,'System32','whoami.exe'),['/user','/fo','csv','/nh'],signal,10000);
   const sid=identity.stdout.match(/\bS-1-\d+(?:-\d+)+\b/)?.[0];
   if(!sid)throw new Error('Windows user identity unavailable');
   // Secure the empty directory BEFORE linking private workspace data. This
   // also makes the Windows Temp fallback safe for Unicode user profiles.
   await runProcess(join(systemRoot,'System32','icacls.exe'),[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],signal,10000);
   const path=join(directory,'workspace');
   await symlink(target,path,'junction');linked=true;
   if(await realpath(path)!==target)throw new Error('Native workspace alias mismatch');
   const ownedDirectory=directory;
   let closing:Promise<void>|undefined;
   return{path,close:()=>closing??=(async()=>{
    // Never recursively remove a junction: unlink the alias, then remove its
    // now-empty owned parent. Neither operation follows the workspace target.
    await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(ownedDirectory).catch(error=>{if(error.code!=='ENOENT')throw error;});
   })()};
  }catch{
   if(directory){
    if(linked)await unlink(join(directory,'workspace')).catch(()=>{});
    await rmdir(directory).catch(()=>{});
   }
  }
 }
 throw new ReaderError('WORKSPACE_MEMORY_UNAVAILABLE','无法为本地记忆创建受保护的临时目录，请检查 Windows 临时目录权限');
}
