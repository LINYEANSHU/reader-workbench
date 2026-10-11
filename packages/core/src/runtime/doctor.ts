import { access } from 'node:fs/promises';
import { delimiter,join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DoctorReport,RuntimeConfig } from '../../../contracts/src/runtime.js';
const execute=promisify(execFile);
export async function findLibreOffice():Promise<string|undefined>{
  if(process.env.READER_LIBREOFFICE){try{await access(process.env.READER_LIBREOFFICE);return process.env.READER_LIBREOFFICE;}catch{return undefined;}}
  const names=process.platform==='win32'?['soffice.com','soffice.exe']:['soffice','libreoffice'];
  const dirs=(process.env.PATH??'').split(delimiter);
  if(process.platform==='win32')dirs.push(join(process.env.ProgramFiles??'C:\\Program Files','LibreOffice','program'),join(process.env['ProgramFiles(x86)']??'C:\\Program Files (x86)','LibreOffice','program'));
  if(process.platform==='darwin')dirs.push('/Applications/LibreOffice.app/Contents/MacOS');
  const paths=dirs.flatMap(dir=>names.map(name=>join(dir,name)));
  for(const path of paths){try{await access(path);return path;}catch{}}
}
export async function doctor(_config:RuntimeConfig):Promise<DoctorReport>{
  const path=await findLibreOffice();let libreOffice:DoctorReport['libreOffice']={available:false,errorCode:'CONVERTER_UNAVAILABLE'};
  if(path){try{const {stdout}=await execute(path,['--version'],{windowsHide:true,timeout:10000});libreOffice={available:true,path,version:stdout.trim()};}
    catch{libreOffice={available:false,path,errorCode:'CONVERTER_FAILED'};}}
  return {node:{version:process.version,available:Number(process.versions.node.split('.')[0])>=24},libreOffice};
}
