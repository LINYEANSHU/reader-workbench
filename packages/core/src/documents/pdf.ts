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
// A text layer cannot explain even a small picture/vector or recover an isolated malformed/math glyph. Keep every
// detected visual; 80 readable characters is only a minimum evidence threshold, never proof that all content is text.
export const TEXT_PAGE_LIMITS=Object.freeze({minChars:80,maxGarbledRatio:0,maxImageCoverage:0,maxPathOps:0,maxMathRatio:0});
interface ProfileText {str:string;fontName?:string;transform?:number[];width?:number;height?:number}
// A page that fails the text test only through formula glyphs is read as text plus crops of its formula regions,
// unless there are so many that the crops would cost about as much as the page image.
export const FORMULA_REGION_LIMITS=Object.freeze({maxRegions:12,maxCoverage:0.5,maxGlyphRuns:400});
type Box=[number,number,number,number];
/**
 * Formula regions (page fractions, top-left origin) from boxes of formula glyph runs in viewport units. Runs closer than
 * about one and a half glyph heights across or half a height vertically are one formula, which joins scripts,
 * numerators and denominators, and the plain-font operators and digits between math-font glyphs.
 */
export function formulaRegions(runs:Array<{box:Box;size:number}>,width:number,height:number):Box[]|undefined{
  if(!runs.length||runs.length>FORMULA_REGION_LIMITS.maxGlyphRuns||width<=0||height<=0)return undefined;
  const regions=runs.map(run=>({box:[...run.box] as Box,size:Math.max(1,run.size)}));
  for(let changed=true;changed;){changed=false;
    for(let first=0;first<regions.length;first++)for(let second=first+1;second<regions.length;second++){
      const a=regions[first]!,b=regions[second]!,size=Math.max(a.size,b.size),across=Math.max(a.box[0],b.box[0])-Math.min(a.box[2],b.box[2]),down=Math.max(a.box[1],b.box[1])-Math.min(a.box[3],b.box[3]);
      if(across<=1.5*size&&down<=0.6*size){a.box=[Math.min(a.box[0],b.box[0]),Math.min(a.box[1],b.box[1]),Math.max(a.box[2],b.box[2]),Math.max(a.box[3],b.box[3])];a.size=size;regions.splice(second,1);second--;changed=true;}
    }}
  // A glyph height of margin across keeps plain-font scripts and operators right at the edges of the formula.
  const boxes=regions.map(({box,size}):Box=>[Math.max(0,(box[0]-size)/width),Math.max(0,(box[1]-0.3*size)/height),Math.min(1,(box[2]+size)/width),Math.min(1,(box[3]+0.3*size)/height)]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  const coverage=boxes.reduce((sum,box)=>sum+(box[2]-box[0])*(box[3]-box[1]),0);
  return boxes.length<=FORMULA_REGION_LIMITS.maxRegions&&coverage<=FORMULA_REGION_LIMITS.maxCoverage?boxes:undefined;
}
/** Classifies one page from its text items and operator list (user-space CTM determinants give drawn image areas). */
export function profilePage(items:ProfileText[],fontName:(id:string)=>string|undefined,operators:{fnArray:number[];argsArray:unknown[][]},width:number,height:number,toViewport?:(x:number,y:number)=>number[]):PageProfile{
  let characters=0,garbled=0,math=0;const mathFont=new Map<string,boolean>(),runs:Array<{box:Box;size:number}>=[];
  for(const item of items){const isMathFont=item.fontName?mathFont.get(item.fontName)??(()=>{const value=MATH_FONT.test(fontName(item.fontName!)??'');mathFont.set(item.fontName!,value);return value;})():false;
    let itemCharacters=0,itemMath=0;
    for(const character of item.str){if(/\s/u.test(character))continue;characters++;itemCharacters++;if(GARBLED_CHAR.test(character))garbled++;else if(isMathFont||MATH_CHAR.test(character)){math++;itemMath++;}}
    // A run that is mostly formula glyphs marks where a formula is drawn; its box spans descender to ascender.
    if(toViewport&&item.transform&&itemCharacters&&itemMath*2>=itemCharacters){const [,,,,x,y]=item.transform as [number,number,number,number,number,number],size=item.height||Math.hypot(item.transform[2]!,item.transform[3]!)||10,corners=[toViewport(x,y-0.25*size),toViewport(x+(item.width??0),y+0.85*size)];
      runs.push({box:[Math.min(corners[0]![0]!,corners[1]![0]!),Math.min(corners[0]![1]!,corners[1]![1]!),Math.max(corners[0]![0]!,corners[1]![0]!),Math.max(corners[0]![1]!,corners[1]![1]!)],size});}}
  let scale=1,imageArea=0,pathOps=0;const stack:number[]=[];
  operators.fnArray.forEach((operation,index)=>{const args=operators.argsArray[index]??[];
    if(operation===OPS.save)stack.push(scale);else if(operation===OPS.restore)scale=stack.pop()??scale;
    else if(operation===OPS.transform){const [a,b,c,d]=args as number[];scale*=Math.abs(a!*d!-b!*c!)||1;}
    else if(operation===OPS.paintFormXObjectBegin){stack.push(scale);const matrix=args[0] as number[]|null;if(Array.isArray(matrix)&&matrix.length>=4)scale*=Math.abs(matrix[0]!*matrix[3]!-matrix[1]!*matrix[2]!)||1;}
    else if(operation===OPS.paintFormXObjectEnd)scale=stack.pop()??scale;
    else if(operation===OPS.paintImageXObject||operation===OPS.paintInlineImageXObject||operation===OPS.paintImageMaskXObject)imageArea+=scale;
    else if(operation===OPS.paintImageXObjectRepeat){const [,scaleX,scaleY,positions]=args as [unknown,number,number,number[]];imageArea+=Math.abs(scaleX*scaleY)*scale*Math.max(1,(positions?.length??2)/2);}
    // Grouped images and masks have renderer-specific transforms. Their presence is enough to retain the page image;
    // a precise area estimate is not needed for deciding whether plain text preserves all detected content.
    else if(operation===OPS.paintInlineImageXObjectGroup||operation===OPS.paintImageMaskXObjectGroup||operation===OPS.paintImageMaskXObjectRepeat||operation===OPS.paintSolidColorImageMask)imageArea+=Math.max(1,scale);
    else if(operation===OPS.constructPath||operation===OPS.shadingFill||operation===OPS.rawFillPath)pathOps++;});
  const ratio=(value:number)=>characters?value/characters:0,imageCoverage=Math.min(1,width*height>0?imageArea/(width*height):0);
  const profile={textChars:characters,garbledRatio:ratio(garbled),imageCoverage,pathOps,mathRatio:ratio(math)},limits=TEXT_PAGE_LIMITS;
  const cleanText=characters>=limits.minChars&&profile.garbledRatio<=limits.maxGarbledRatio&&imageCoverage<=limits.maxImageCoverage&&pathOps<=limits.maxPathOps;
  const textSufficient=cleanText&&profile.mathRatio<=limits.maxMathRatio,regions=cleanText&&!textSufficient?formulaRegions(runs,width,height):undefined;
  return{...profile,textSufficient,...(regions?{formulaRegions:regions}:{})};
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
      profile=profilePage(content.items.filter(item=>'str' in item) as ProfileText[],id=>{try{const font=documentPage.commonObjs.get(id) as {name?:string;loadedName?:string}|undefined;return font?.name??font?.loadedName;}catch{return undefined;}},operators as unknown as {fnArray:number[];argsArray:unknown[][]},viewport.width,viewport.height,(x,y)=>viewport.convertToViewportPoint(x,y));
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
    else{const created:{loading:Promise<LoadedPdf>;users:number;timer?:ReturnType<typeof setTimeout>}={loading:this.load(path),users:0};entry=created;this.entries.set(key,created);created.loading.catch(()=>{if(this.entries.get(key)===created)this.entries.delete(key);});}
    const current=entry;clearTimeout(current.timer);current.users++;this.evict();
    try{return await task((await current.loading).pdf);}
    finally{current.users--;this.evict();if(!current.users&&this.entries.get(key)===current){current.timer=setTimeout(()=>this.close(key),this.idleMs);current.timer.unref?.();}}
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
 * PNG crops of a page's formula regions (page fractions), rendered at a higher scale than the page preview so small
 * scripts stay legible, and cached beside it as page-N-formula-K.png.
 */
export async function renderPdfRegions(path:string,page:number,regions:ReadonlyArray<readonly [number,number,number,number]>,cacheDir:string,signal:AbortSignal):Promise<string[]>{
  const destinations=regions.map((_,index)=>join(cacheDir,'page-'+page+'-formula-'+(index+1)+'.png'));
  if((await Promise.all(destinations.map(file=>access(file).then(()=>true,()=>false)))).every(Boolean))return destinations;
  return renderCache.use(path,async pdf=>{
    signal.throwIfAborted();
    if(!Number.isInteger(page)||page<1||page>pdf.numPages)throw new ReaderError('PAGE_UNAVAILABLE','页码无效',404);
    const documentPage=await pdf.getPage(page),base=documentPage.getViewport({scale:1}),viewport=documentPage.getViewport({scale:Math.min(2.5,6000/Math.max(base.width,base.height))});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
    const rendering=documentPage.render({canvas:canvas as unknown as HTMLCanvasElement,viewport});
    const abort=()=>rendering.cancel();signal.addEventListener('abort',abort,{once:true});
    try{await rendering.promise;signal.throwIfAborted();
      for(const [index,region] of regions.entries()){
        const left=Math.floor(region[0]*canvas.width),top=Math.floor(region[1]*canvas.height),cropWidth=Math.max(1,Math.ceil(region[2]*canvas.width)-left),cropHeight=Math.max(1,Math.ceil(region[3]*canvas.height)-top);
        const crop=createCanvas(cropWidth,cropHeight);crop.getContext('2d').drawImage(canvas,left,top,cropWidth,cropHeight,0,0,cropWidth,cropHeight);
        const destination=destinations[index]!,temporary=destination+'.'+process.pid+'-'+Date.now()+'.tmp';await writeFile(temporary,crop.toBuffer('image/png'));await rename(temporary,destination);
      }}
    finally{signal.removeEventListener('abort',abort);documentPage.cleanup();}
    return destinations;
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
