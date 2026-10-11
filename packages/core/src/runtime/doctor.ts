import { access } from 'node:fs/promises';
import { delimiter,join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DoctorReport,RuntimeConfig } from '../../../contracts/src/runtime.js';
import {createRequire} from 'node:module';
import {SpeechAssets,SENSEVOICE_ASSETS} from '../speech/assets.js';
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
export async function doctor(config:RuntimeConfig):Promise<DoctorReport>{
  const path=await findLibreOffice();let libreOffice:DoctorReport['libreOffice']={available:false,errorCode:'CONVERTER_UNAVAILABLE'};
  if(path){try{const {stdout}=await execute(path,['--version'],{windowsHide:true,timeout:10000});libreOffice={available:true,path,version:stdout.trim()};}
    catch{libreOffice={available:false,path,errorCode:'CONVERTER_FAILED'};}}
  const cacheDirectory=process.env.READER_SPEECH_ASSET_DIR??join(config.configDir,'speech','sensevoice-small-int8');let runtimeAvailable=false,modelReady=false;
  try{createRequire(import.meta.url).resolve('sherpa-onnx-'+(process.platform==='win32'?'win':process.platform)+'-'+process.arch);runtimeAvailable=true;}catch{}
  try{const assets=new SpeechAssets(cacheDirectory),signal=AbortSignal.timeout(10000);modelReady=(await Promise.all(SENSEVOICE_ASSETS.map(asset=>assets.valid(asset,signal)))).every(Boolean);}catch{}
  return {node:{version:process.version,available:Number(process.versions.node.split('.')[0])>=24},libreOffice,speech:{runtimeAvailable,runtimeVersion:'1.13.8',modelReady,cacheDirectory,...(!runtimeAvailable?{errorCode:'SPEECH_RUNTIME_UNAVAILABLE'}:{})}};
}
