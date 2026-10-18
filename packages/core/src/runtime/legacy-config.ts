import {lstat,readFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {writePrivateJson} from './secure-file.js';
import {ReaderError} from '../../../contracts/src/errors.js';

async function readJson(path:string):Promise<unknown|undefined>{
 try{if((await lstat(path)).isSymbolicLink())throw new Error('Private configuration cannot be a symbolic link');return JSON.parse(await readFile(path,'utf8'));}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
}
/** Move only known settings after writing a protected backup. Never reuse a stale connection token. */
export async function migrateLegacyConfig(target:string,sources:string[]):Promise<void>{
 for(const source of sources){
  const canonical=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
  if(canonical(source)===canonical(target))continue;
  // A duplicate launch must not move the credential file out from under a live old daemon.
  let connection:{url?:string;token?:string;pid?:number}|undefined;
  try{connection=await readJson(join(source,'connection.json')) as typeof connection;}catch(error){if(!(error instanceof SyntaxError))throw error;}
  if(connection?.url&&connection.token){
   let active=false;
   try{
    const url=new URL(connection.url);
    if(['127.0.0.1','[::1]','localhost'].includes(url.hostname)&&url.protocol==='http:')active=(await fetch(new URL('/api/v1/config',url),{headers:{authorization:'Bearer '+connection.token},signal:AbortSignal.timeout(1000),redirect:'error'})).ok;
    else if(Number.isSafeInteger(connection.pid)&&connection.pid!>0){try{process.kill(connection.pid!,0);active=true;}catch(error){active=(error as NodeJS.ErrnoException).code!=='ESRCH';}}
    else active=true;
   }catch{}
   if(active)throw new ReaderError('LEGACY_SERVER_RUNNING','请先关闭旧版阅读服务，再重新启动。配置尚未迁移。',409);
  }
  const backupId=createHash('sha256').update(resolve(source)).digest('hex').slice(0,16);
  for(const name of ['credentials.json','workspaces.json']){
   const path=join(source,name),legacy=await readJson(path);if(legacy===undefined)continue;
   const destination=join(target,name),current=await readJson(destination);
   let merged:unknown;
   if(name==='credentials.json'){
    const valid=(value:unknown):value is Record<string,string>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.values(value).every(item=>typeof item==='string');
    if(!valid(legacy)||current!==undefined&&!valid(current))throw new Error('Invalid private credential configuration');
    merged={...legacy,...current as Record<string,string>|undefined};
   }else{
    const valid=(value:unknown):value is Array<{id:string}>=>Array.isArray(value)&&value.every(item=>item&&typeof item.id==='string');
    if(!valid(legacy)||current!==undefined&&!valid(current))throw new Error('Invalid workspace configuration');
    merged=[...new Map([...legacy,...current as Array<{id:string}>??[]].map(item=>[item.id,item])).values()];
   }
   const backup=join(target,'agent','legacy',backupId+'-'+name);
   // Keep the first complete backup if a partially completed migration is retried.
   if(await readJson(backup)===undefined)await writePrivateJson(backup,legacy);
   await writePrivateJson(destination,merged);
   if(JSON.stringify(await readJson(destination))!==JSON.stringify(merged))throw new Error('Private configuration migration could not be verified');
   await unlink(path);
  }
 }
}
