import { chmod,mkdir,rename,writeFile,rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute=promisify(execFile);
export async function protectPath(path:string,directory=false):Promise<void>{
  if(process.platform==='win32'){
    const account=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+userInfo().username;
    await execute('icacls.exe',[path,'/inheritance:r','/grant:r',account+':'+(directory?'(OI)(CI)F':'F')],{windowsHide:true,timeout:10000});
  }else await chmod(path,directory?0o700:0o600);
}
export async function writePrivateJson(path:string,value:unknown):Promise<void>{
  await mkdir(dirname(path),{recursive:true,mode:0o700});await protectPath(dirname(path),true);
  const temporary=path+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await protectPath(temporary);await rename(temporary,path);}
  finally{await rm(temporary,{force:true});}
}
