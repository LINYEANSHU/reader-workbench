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
import {docxFormulaBlocks} from './office-math.js';
import {docxTableBlocks} from './docx-tables.js';
import {extractSlides,slidePages,type SlideContent} from './slides.js';
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
  if(input.extension==='.pptx'){
    // Slide structure, tables, chart data and formulas come from the .pptx itself. A slide whose content is all text
    // (see slideContent) is pre-read from that text instead of its rendered image.
    let slides:SlideContent[]=[];try{slides=await extractSlides(input.path);}catch{parsed.warnings.push('PPT 原文件结构未能读取，幻灯片内容以转换后的页面文字为准。');}
    const visible=slides.length?slidePages(slides):undefined,mapped=visible&&visible.size===parsed.pages.length?visible:undefined;
    if(slides.length&&!mapped)parsed.warnings.push('PPT 可见幻灯片数与预览页数不一致，未加入幻灯片原文结构。');
    if(mapped)for(const slide of slides){const page=mapped.get(slide.slide),target=page?parsed.pages.find(item=>item.page===page):undefined;if(!page||!target)continue;
      if(slide.markdown)parsed.blocks.push({id:'slide-'+page,text:slide.markdown,kind:'slide',anchor:{workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'page',page}}});
      // The rendered profile also sees inherited layout/master and background visuals, absent from the slide XML.
      target.profile={...(target.profile??{textChars:0,garbledRatio:0,imageCoverage:0,pathOps:0,mathRatio:0}),textSufficient:slide.textSufficient&&target.profile?.textSufficient===true,formulaRegions:slide.textSufficient?target.profile?.formulaRegions:undefined};}
    // Notes are numbered by slide; hidden slides are not rendered, so later notes move to their visible page.
    const notes=(await extractNotes(input.path)).map(note=>({...note,page:mapped?mapped.get(note.page)??0:note.page}));for(const note of notes){
    const page=parsed.pages.find(page=>page.page===note.page);
    if(page)parsed.blocks.push({id:'note-'+note.page,text:note.text,kind:'notes',anchor:{workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'page',page:note.page}}});
    else {
      parsed.warnings.push('PPT 备注无法对应源页: '+note.id);
      parsed.blocks.push({id:'unmapped-'+note.id,text:note.text,kind:'notes-unmapped',anchor:{workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'block',blockId:'unmapped-'+note.id,start:0,end:note.text.length}}});
    }
  }}
  // Rendered PDF text scatters formula glyphs; the source OMML gives each formula exactly, as LaTeX blocks on its page.
  if(input.extension==='.docx'){let requiresVisual=false;try{const {blocks,unmapped}=await docxFormulaBlocks(input,parsed.pages);parsed.blocks.push(...blocks);if(unmapped){requiresVisual=true;parsed.warnings.push(unmapped+' 个 Word 公式无法对应到预览页，改用页面图像核对。');}}catch{requiresVisual=true;parsed.warnings.push('Word 公式未能从原文件读取，改用页面图像核对。');}
    // Likewise tables: rows, columns and merged cells come from the source instead of interleaved rendered text.
    try{const {blocks,unmapped}=await docxTableBlocks(input,parsed.pages);parsed.blocks.push(...blocks);if(unmapped){requiresVisual=true;parsed.warnings.push(unmapped+' 个 Word 表格无法对应到预览页，改用页面图像核对。');}}catch{requiresVisual=true;parsed.warnings.push('Word 表格未能从原文件读取，改用页面图像核对。');}
    // The missing element's page is unknown, so every selected page must be checked visually rather than guessed.
    if(requiresVisual)for(const page of parsed.pages)page.profile={...(page.profile??{textChars:page.text.length,garbledRatio:0,imageCoverage:0,pathOps:0,mathRatio:0}),textSufficient:false,formulaRegions:undefined,requiresVisual:true};}
  parsed.warnings.push('Office 页面由 LibreOffice 转换；缺失字体或转换器差异可能改变排版。');return parsed;
}};
