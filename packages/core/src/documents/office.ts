import {mkdtemp,access,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import type {VersionedFile} from '../../../contracts/src/documents.js';
import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {findLibreOffice} from '../runtime/doctor.js';
import {runProcess} from '../runtime/process.js';
import {parsePdf} from './pdf.js';
import {extractNotes} from './notes.js';
import {isWithin} from '../workspaces/path-guard.js';
let queue:Promise<unknown>=Promise.resolve();
export async function convertOffice(input:VersionedFile,signal:AbortSignal):Promise<string>{
 const conversion=queue.catch(()=>{}).then(async()=>{
  signal.throwIfAborted();const executable=await findLibreOffice();if(!executable)throw new ReaderError('CONVERTER_UNAVAILABLE','未找到 LibreOffice，请安装或设置 READER_LIBREOFFICE');
  const version=await runProcess(executable,['--version'],signal,10000);
  const signature=version.stdout.trim();const metadata=join(input.cacheDir,'conversion.json'),destination=join(input.cacheDir,'source.pdf');
  try{if(JSON.parse(await readFile(metadata,'utf8')).engine===signature){await access(destination);return destination;}}catch{}
  // LibreOffice creates long nested profile files; keep its private staging
  // independent of workspace depth. Only the durable preview stays in cacheDir.
  const workRoot=await realpath(tmpdir()),output=await mkdtemp(join(workRoot,'reader-office-'));
  try{
    const staged=join(output,'source'+input.extension);await writeFile(staged,await readFile(input.path),{flag:'wx',mode:0o600});
    const profile=pathToFileURL(join(output,'profile')).href;
    await runProcess(executable,['-env:UserInstallation='+profile,'--headless','--nologo','--nodefault','--nofirststartwizard','--convert-to','pdf','--outdir',output,staged],signal,120000);
    const converted=join(output,'source.pdf');try{await access(converted);}catch{throw new ReaderError('CONVERTER_FAILED','LibreOffice 未生成预览，请检查转换器和本机字体');}
    await writeFile(destination,await readFile(converted));await writeFile(metadata,JSON.stringify({engine:signature,source:input.version}));
  }finally{if(resolve(output)===resolve(workRoot)||!isWithin(workRoot,output))throw new ReaderError('PATH_OUTSIDE_WORKSPACE','临时转换目录无效',403);await rm(output,{recursive:true,force:true});}
  return destination;
 });queue=conversion;return conversion;
}
export const officeAdapter:DocumentAdapter={supports:(_mime,extension)=>['.doc','.docx','.ppt','.pptx'].includes(extension),parse:async(input,signal)=>{
  const pdfPath=await convertOffice(input,signal);const parsed=await parsePdf({...input,path:pdfPath,mime:'application/pdf'},signal);parsed.pdfPath=pdfPath;
  if(input.extension==='.pptx'){const notes=await extractNotes(input.path);for(const note of notes){
    const page=parsed.pages.find(page=>page.page===note.page);
    if(page)parsed.blocks.push({id:'note-'+note.page,text:note.text,kind:'notes',anchor:{workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'page',page:note.page}}});
    else {
      parsed.warnings.push('PPT 备注无法对应源页: '+note.id);
      parsed.blocks.push({id:'unmapped-'+note.id,text:note.text,kind:'notes-unmapped',anchor:{workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'block',blockId:'unmapped-'+note.id,start:0,end:note.text.length}}});
    }
  }}
  parsed.warnings.push('Office 页面由 LibreOffice 转换；缺失字体或转换器差异可能改变排版。');return parsed;
}};
