import { chmod,mkdir,rename,writeFile,rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute=promisify(execFile);
const protectedDirs=new Set<string>();
let windowsPrincipal:Promise<string>|undefined;
async function resolveWindowsPrincipal():Promise<string>{
  if(!windowsPrincipal)windowsPrincipal=(async()=>{
    try{
      const {stdout}=await execute('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,timeout:10000});
      const sid=stdout.match(/\bS-1-\d+(?:-\d+)+\b/)?.[0];
      if(sid)return '*'+sid;
    }catch{}
    return (process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+userInfo().username;
  })();
  return windowsPrincipal;
}
export async function protectPath(path:string,directory=false):Promise<void>{
  if(process.platform==='win32'){
    const account=await resolveWindowsPrincipal();
    await execute('icacls.exe',[path,'/inheritance:r','/grant:r',account+':'+(directory?'(OI)(CI)F':'F')],{windowsHide:true,timeout:10000});
  }else await chmod(path,directory?0o700:0o600);
}
export async function writePrivateJson(path:string,value:unknown):Promise<void>{
  const dir=dirname(path);
  await mkdir(dir,{recursive:true,mode:0o700});
  if(!protectedDirs.has(dir)){await protectPath(dir,true);protectedDirs.add(dir);}
  const temporary=path+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await protectPath(temporary);await rename(temporary,path);}
  finally{await rm(temporary,{force:true});}
}
