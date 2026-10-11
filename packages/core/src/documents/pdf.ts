import {readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
import type {VersionedFile,ParsedDocument} from '../../../contracts/src/documents.js';
import {ReaderError} from '../../../contracts/src/errors.js';
const require=createRequire(import.meta.url);
const resources=dirname(require.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
async function loadPdf(path:string,signal:AbortSignal){
  const data=new Uint8Array(await readFile(path,{signal}));
  const assetUrl=(folder:string)=>join(resources,folder).replaceAll('\\','/')+'/';
  const loading=getDocument({data,cMapUrl:assetUrl('cmaps'),cMapPacked:true,standardFontDataUrl:assetUrl('standard_fonts'),wasmUrl:assetUrl('wasm')});
  const abort=()=>{void loading.destroy();};signal.addEventListener('abort',abort,{once:true});
  try{return {pdf:await loading.promise,release:async()=>{signal.removeEventListener('abort',abort);await loading.destroy();}};}
  catch(error){signal.removeEventListener('abort',abort);if(signal.aborted)throw new ReaderError('CANCELLED','解析已取消');
    throw new ReaderError((error as {name?:string}).name==='PasswordException'?'PDF_PASSWORD_REQUIRED':'DOCUMENT_PARSE_FAILED',(error as {name?:string}).name==='PasswordException'?'PDF 已加密，请先提供解密副本':'PDF 无法解析，文件可能损坏');}
}
export async function parsePdf(input:VersionedFile,signal:AbortSignal):Promise<ParsedDocument>{
  const {pdf,release}=await loadPdf(input.path,signal);const result:ParsedDocument={pages:[],blocks:[],warnings:[],pdfPath:input.path};
  try{for(let page=1;page<=pdf.numPages;page++){
    signal.throwIfAborted();const documentPage=await pdf.getPage(page),viewport=documentPage.getViewport({scale:1});
    const content=await documentPage.getTextContent();const text=content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('').trim();
    const anchor={workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'page' as const,page}};
    result.pages.push({page,text,width:viewport.width,height:viewport.height,anchors:[anchor]});
    result.blocks.push({id:'page-'+page,text,anchor});
    if(!text)result.warnings.push('第 '+page+' 页无文本层，可能为扫描页；没有执行 OCR。');documentPage.cleanup();
  }}finally{await release();}return result;
}
export async function renderPdfPage(path:string,page:number,cacheDir:string,signal:AbortSignal):Promise<string>{
  const destination=join(cacheDir,'page-'+page+'.png');try{await readFile(destination);return destination;}catch{}
  const {pdf,release}=await loadPdf(path,signal);
  try{
    if(!Number.isInteger(page)||page<1||page>pdf.numPages)throw new ReaderError('PAGE_UNAVAILABLE','页码无效',404);
    const documentPage=await pdf.getPage(page);const base=documentPage.getViewport({scale:1});
    const scale=Math.min(1.5,4096/Math.max(base.width,base.height));const viewport=documentPage.getViewport({scale});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    const rendering=documentPage.render({canvas:canvas as unknown as HTMLCanvasElement,viewport});
    const abort=()=>rendering.cancel();signal.addEventListener('abort',abort,{once:true});
    try{await rendering.promise;signal.throwIfAborted();await writeFile(destination,canvas.toBuffer('image/png'));}
    finally{signal.removeEventListener('abort',abort);}return destination;
  }finally{await release();}
}
export const pdfAdapter:DocumentAdapter={supports:mime=>mime==='application/pdf',parse:parsePdf};
