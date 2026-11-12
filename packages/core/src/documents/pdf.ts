import {readFile,writeFile,access,rename,stat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {getDocument,GlobalWorkerOptions,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
import type {VersionedFile,ParsedDocument,PageProfile} from '../../../contracts/src/documents.js';
import {ReaderError} from '../../../contracts/src/errors.js';
const require=createRequire(import.meta.url);
const resources=dirname(require.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
async function loadPdf(path:string,signal:AbortSignal,fontNames=false){
  const data=new Uint8Array(await readFile(path,{signal}));
  const assetUrl=(folder:string)=>join(resources,folder).replaceAll('\\','/')+'/';
  const loading=getDocument({data,cMapUrl:assetUrl('cmaps'),cMapPacked:true,standardFontDataUrl:assetUrl('standard_fonts'),wasmUrl:assetUrl('wasm'),fontExtraProperties:fontNames});
  const abort=()=>{void loading.destroy();};signal.addEventListener('abort',abort,{once:true});
  try{return {pdf:await loading.promise,release:async()=>{signal.removeEventListener('abort',abort);await loading.destroy();}};}
  catch(error){signal.removeEventListener('abort',abort);if(signal.aborted)throw new ReaderError('CANCELLED','解析已取消');
    throw new ReaderError((error as {name?:string}).name==='PasswordException'?'PDF_PASSWORD_REQUIRED':'DOCUMENT_PARSE_FAILED',(error as {name?:string}).name==='PasswordException'?'PDF 已加密，请先提供解密副本':'PDF 无法解析，文件可能损坏');}
}
// Fonts that typeset mathematics; their glyphs rarely extract as readable formulas.
const MATH_FONT=/(?:^|\+)(?:CMMI|CMSY|CMEX|CMBSY|MSAM|MSBM|EUFM|EUSM|RSFS|LMMath|lmmi|lmsy|lmex|STIX\w*Math|XITS\w*Math|Cambria\W?Math|Latin\W?Modern\W?Math|TeXGyre\w*Math|Asana|Symbol|MT\W?Extra|Euclid|MathematicalPi)/i;
const MATH_CHAR=/[Α-Ωα-ω∀-⋿⨀-⫿⟀-⟯←-⇿\u{1d400}-\u{1d7ff}]/u;
const GARBLED_CHAR=/[�-\u0000-\u0008\u000b\u000c\u000e-\u001f]/u;
// A page goes to the model as text only when that is clearly safe: enough readable text, no sizeable pictures,
// no dense vector drawing (charts, diagrams) and few formula glyphs. Anything else keeps its page image.
export const TEXT_PAGE_LIMITS=Object.freeze({minChars:80,maxGarbledRatio:0.02,maxImageCoverage:0.1,maxPathOps:120,maxMathRatio:0.08});
interface ProfileText {str:string;fontName?:string}
/** Classifies one page from its text items and operator list (user-space CTM determinants give drawn image areas). */
export function profilePage(items:ProfileText[],fontName:(id:string)=>string|undefined,operators:{fnArray:number[];argsArray:unknown[][]},width:number,height:number):PageProfile{
  let characters=0,garbled=0,math=0;const mathFont=new Map<string,boolean>();
  for(const item of items){const isMathFont=item.fontName?mathFont.get(item.fontName)??(()=>{const value=MATH_FONT.test(fontName(item.fontName!)??'');mathFont.set(item.fontName!,value);return value;})():false;
    for(const character of item.str){if(/\s/u.test(character))continue;characters++;if(GARBLED_CHAR.test(character))garbled++;else if(isMathFont||MATH_CHAR.test(character))math++;}}
  let scale=1,imageArea=0,pathOps=0;const stack:number[]=[];
  operators.fnArray.forEach((operation,index)=>{const args=operators.argsArray[index]??[];
    if(operation===OPS.save)stack.push(scale);else if(operation===OPS.restore)scale=stack.pop()??scale;
    else if(operation===OPS.transform){const [a,b,c,d]=args as number[];scale*=Math.abs(a!*d!-b!*c!)||1;}
    else if(operation===OPS.paintFormXObjectBegin){stack.push(scale);const matrix=args[0] as number[]|null;if(Array.isArray(matrix)&&matrix.length>=4)scale*=Math.abs(matrix[0]!*matrix[3]!-matrix[1]!*matrix[2]!)||1;}
    else if(operation===OPS.paintFormXObjectEnd)scale=stack.pop()??scale;
    else if(operation===OPS.paintImageXObject||operation===OPS.paintInlineImageXObject||operation===OPS.paintImageMaskXObject)imageArea+=scale;
    else if(operation===OPS.paintImageXObjectRepeat){const [,scaleX,scaleY,positions]=args as [unknown,number,number,number[]];imageArea+=Math.abs(scaleX*scaleY)*scale*Math.max(1,(positions?.length??2)/2);}
    else if(operation===OPS.constructPath)pathOps++;});
  const ratio=(value:number)=>characters?value/characters:0,imageCoverage=Math.min(1,width*height>0?imageArea/(width*height):0);
  const profile={textChars:characters,garbledRatio:ratio(garbled),imageCoverage,pathOps,mathRatio:ratio(math)},limits=TEXT_PAGE_LIMITS;
  return{...profile,textSufficient:characters>=limits.minChars&&profile.garbledRatio<=limits.maxGarbledRatio&&imageCoverage<=limits.maxImageCoverage&&pathOps<=limits.maxPathOps&&profile.mathRatio<=limits.maxMathRatio};
}
export async function parsePdf(input:VersionedFile,signal:AbortSignal):Promise<ParsedDocument>{
  const {pdf,release}=await loadPdf(input.path,signal,true);const result:ParsedDocument={pages:[],blocks:[],warnings:[],pdfPath:input.path};
  try{for(let page=1;page<=pdf.numPages;page++){
    signal.throwIfAborted();const documentPage=await pdf.getPage(page),viewport=documentPage.getViewport({scale:1});
    const content=await documentPage.getTextContent();const text=content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('').trim();
    const anchor={workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'page' as const,page}};
    // The operator list also resolves the page's fonts, so their names are readable for formula detection.
    let profile:PageProfile|undefined;
    try{const operators=await documentPage.getOperatorList();signal.throwIfAborted();
      profile=profilePage(content.items.filter(item=>'str' in item) as ProfileText[],id=>{try{const font=documentPage.commonObjs.get(id) as {name?:string;loadedName?:string}|undefined;return font?.name??font?.loadedName;}catch{return undefined;}},operators as unknown as {fnArray:number[];argsArray:unknown[][]},viewport.width,viewport.height);
    }catch(error){if(signal.aborted)throw error;}
    result.pages.push({page,text,width:viewport.width,height:viewport.height,anchors:[anchor],...(profile?{profile}:{})});
    result.blocks.push({id:'page-'+page,text,anchor});
    if(!text)result.warnings.push('第 '+page+' 页无文本层，可能为扫描页；没有执行 OCR。');documentPage.cleanup();
  }}finally{await release();}return result;
}
type LoadedPdf=Awaited<ReturnType<typeof loadPdf>>;
/**
 * Keeps recently rendered PDFs open, so rendering consecutive pages parses the file once instead of once per page.
 * Entries are keyed by path, size and modification time (a converted Office preview can be regenerated in place),
 * at most `capacity` stay open, and an unused one closes after `idleMs`.
 */
export class PdfDocumentCache{
  private entries=new Map<string,{loading:Promise<LoadedPdf>;users:number;timer?:ReturnType<typeof setTimeout>}>();
  constructor(private load:(path:string)=>Promise<LoadedPdf>,private capacity=2,private idleMs=30_000){}
  async use<T>(path:string,task:(pdf:LoadedPdf['pdf'])=>Promise<T>):Promise<T>{
    const info=await stat(path),key=path+'|'+info.size+'|'+info.mtimeMs;let entry=this.entries.get(key);
    if(entry){this.entries.delete(key);this.entries.set(key,entry);}
    else{const created:{loading:Promise<LoadedPdf>;users:number;timer?:ReturnType<typeof setTimeout>}={loading:this.load(path),users:0};entry=created;this.entries.set(key,created);created.loading.catch(()=>{if(this.entries.get(key)===created)this.entries.delete(key);});this.evict();}
    const current=entry;clearTimeout(current.timer);current.users++;
    try{return await task((await current.loading).pdf);}
    finally{current.users--;if(!current.users&&this.entries.get(key)===current){current.timer=setTimeout(()=>this.close(key),this.idleMs);current.timer.unref?.();}}
  }
  private evict(){for(const [key,entry] of [...this.entries]){if(this.entries.size<=this.capacity)break;if(!entry.users)this.close(key);}}
  private close(key:string){const entry=this.entries.get(key);if(!entry)return;this.entries.delete(key);clearTimeout(entry.timer);void entry.loading.then(loaded=>loaded.release()).catch(()=>{});}
  /** Closes idle documents now; one still rendering closes on its idle timer. */
  closeAll(){for(const [key,entry] of [...this.entries])if(!entry.users)this.close(key);}
}
const renderCache=new PdfDocumentCache(path=>loadPdf(path,new AbortController().signal));
export function closePdfRenderCache(){renderCache.closeAll();}
export async function renderPdfPage(path:string,page:number,cacheDir:string,signal:AbortSignal):Promise<string>{
  // The cached image is the record of a rendered page; it is written under a temporary name and renamed into place.
  const destination=join(cacheDir,'page-'+page+'.png');try{await access(destination);return destination;}catch{}
  return renderCache.use(path,async pdf=>{
    signal.throwIfAborted();
    if(!Number.isInteger(page)||page<1||page>pdf.numPages)throw new ReaderError('PAGE_UNAVAILABLE','页码无效',404);
    const documentPage=await pdf.getPage(page);const base=documentPage.getViewport({scale:1});
    const scale=Math.min(1.5,4096/Math.max(base.width,base.height));const viewport=documentPage.getViewport({scale});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    const rendering=documentPage.render({canvas:canvas as unknown as HTMLCanvasElement,viewport});
    const abort=()=>rendering.cancel();signal.addEventListener('abort',abort,{once:true});
    try{await rendering.promise;signal.throwIfAborted();const temporary=destination+'.'+process.pid+'-'+Date.now()+'.tmp';await writeFile(temporary,canvas.toBuffer('image/png'));await rename(temporary,destination);}
    finally{signal.removeEventListener('abort',abort);documentPage.cleanup();}return destination;
  });
}
/**
 * A rendered page as sent to a model. Scanned and photo-heavy pages are often several times smaller as JPEG (quality 85,
 * on white), which shortens uploads and fits more pages under request size limits; image tokens depend on dimensions
 * only. Text and line art compress better as PNG, so the smaller format wins. The JPEG is cached beside the render; when
 * it would not be smaller an empty marker records that the PNG is kept. Returns undefined to keep the PNG.
 */
export async function modelRender(pngPath:string,signal:AbortSignal):Promise<Buffer|undefined>{
  if(!/\.png$/i.test(pngPath))return undefined;
  const target=pngPath.replace(/\.png$/i,'')+'.model.jpg',marker=target+'.none';
  try{return await readFile(target,{signal});}catch{}
  try{await access(marker);return undefined;}catch{}
  const png=await readFile(pngPath,{signal}),image=await loadImage(png);signal.throwIfAborted();
  const canvas=createCanvas(image.width,image.height),context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,image.width,image.height);context.drawImage(image,0,0);
  const jpeg=canvas.toBuffer('image/jpeg',85),temporary=(jpeg.length<png.length?target:marker)+'.'+process.pid+'-'+Date.now()+'.tmp';
  await writeFile(temporary,jpeg.length<png.length?jpeg:'');await rename(temporary,jpeg.length<png.length?target:marker);
  return jpeg.length<png.length?jpeg:undefined;
}
export const pdfAdapter:DocumentAdapter={supports:mime=>mime==='application/pdf',parse:parsePdf};
