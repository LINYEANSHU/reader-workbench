import {readFile,writeFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {PDFDocument} from 'pdf-lib';
import type {ProcessingPdfPage} from '../../../sdk/src/document-processing.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {findLibreOffice} from '../runtime/doctor.js';
import {runProcess} from '../runtime/process.js';
import {isWithin} from '../workspaces/path-guard.js';
const require=createRequire(import.meta.url),resources=dirname(require.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
export async function extractProcessingPdfPages(bytes:Uint8Array,pages:number[],signal:AbortSignal):Promise<ProcessingPdfPage[]>{
 const asset=(folder:string)=>join(resources,folder).replaceAll('\\','/')+'/',loading=getDocument({data:bytes.slice(),cMapUrl:asset('cmaps'),cMapPacked:true,standardFontDataUrl:asset('standard_fonts'),wasmUrl:asset('wasm')});const abort=()=>{void loading.destroy();};signal.addEventListener('abort',abort,{once:true});
 try{const pdf=await loading.promise,results:ProcessingPdfPage[]=[];for(const pageNumber of pages){signal.throwIfAborted();const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale:1}),content=await page.getTextContent();const blocks:ProcessingPdfPage['blocks']=[];for(const [index,item]of content.items.entries()){if(!('str' in item)||!item.str.trim())continue;const [a,b,c,d,e,f]=item.transform;const x=viewport.transform[0]*e+viewport.transform[2]*f+viewport.transform[4],baseline=viewport.transform[1]*e+viewport.transform[3]*f+viewport.transform[5],height=Math.max(1,item.height||Math.hypot(c,d)||Math.hypot(a,b));blocks.push({id:'p'+pageNumber+'-'+index,text:item.str,rect:[x,baseline-height,Math.max(1,item.width),height]});}results.push({page:pageNumber,width:viewport.width,height:viewport.height,blocks});page.cleanup();}return results;
 }finally{signal.removeEventListener('abort',abort);await loading.destroy();}
}
export async function combineProcessingPdf(source:Uint8Array,parts:Array<{page:number;translation:Uint8Array}>,signal:AbortSignal){const original=await PDFDocument.load(source),output=await PDFDocument.create();for(const part of parts){signal.throwIfAborted();const [page]=await output.copyPages(original,[part.page-1]);output.addPage(page);const translated=await PDFDocument.load(part.translation);for(const page of await output.copyPages(translated,translated.getPageIndices()))output.addPage(page);}return output.save();}
export async function convertProcessingOffice(bytes:Uint8Array,extension:string,format:'docx',signal:AbortSignal){const executable=await findLibreOffice();if(!executable)throw new ReaderError('CONVERTER_UNAVAILABLE','旧版 Office 翻译需要 LibreOffice，请安装或设置 READER_LIBREOFFICE');const root=await realpath(tmpdir()),directory=await mkdtemp(join(root,'reader-process-'));
 try{const source=join(directory,'source'+extension);await writeFile(source,bytes,{flag:'wx',signal});await runProcess(executable,['-env:UserInstallation='+pathToFileURL(join(directory,'profile')).href,'--headless','--nologo','--nodefault','--nofirststartwizard','--convert-to',format,'--outdir',directory,source],signal,120000);try{return new Uint8Array(await readFile(join(directory,'source.'+format),{signal}));}catch{throw new ReaderError('CONVERTER_FAILED','LibreOffice 未生成可编辑副本');}}
 finally{if(resolve(directory)===resolve(root)||!isWithin(root,directory))throw new ReaderError('PATH_OUTSIDE_WORKSPACE','临时转换目录无效',403);await rm(directory,{recursive:true,force:true});}}
