import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import type {DocumentBlock,DocumentPage,VersionedFile} from '../../../contracts/src/documents.js';
import {extractFormulas,type ExtractedFormula} from './omml.js';
const MAX_PART_BYTES=16*1024*1024,MAX_FORMULAS=2000;
/** Reads selected XML parts of an Office zip, skipping oversized entries. */
export async function readOfficeParts(path:string,wanted:(name:string)=>boolean):Promise<Record<string,string>>{
 let remaining=64*1024*1024;
 const zip=unzipSync(new Uint8Array(await readFile(path)),{filter:file=>{if(!wanted(file.name)||file.originalSize>MAX_PART_BYTES||file.originalSize>remaining)return false;remaining-=file.originalSize;return true;}});
 return Object.fromEntries(Object.entries(zip).map(([name,bytes])=>[name,strFromU8(bytes)]));
}
const squash=(text:string)=>text.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
/**
 * Finds the rendered page of each formula from its surrounding paragraph text, moving forward through the document
 * so repeated phrases resolve to the next occurrence. Formulas without a findable context return page 0.
 */
export function locateFormulas(formulas:ExtractedFormula[],pages:Pick<DocumentPage,'page'|'text'>[]):number[]{
 const texts=pages.map(page=>squash(page.text));let cursor=0;
 return formulas.map(formula=>{
  const probes=[formula.context,formula.before].map(squash).filter(value=>value.length>=6).flatMap(value=>[value.slice(0,24),value.slice(-24)]);
  for(let offset=0;offset<texts.length;offset++){const index=(cursor+offset)%texts.length;if(probes.some(probe=>texts[index]!.includes(probe))){cursor=index;return pages[index]!.page;}}
  return 0;
 });
}
/** Formula blocks for a .docx whose pages come from a PDF rendering; each carries exact LaTeX converted from OMML. */
export async function docxFormulaBlocks(input:VersionedFile,pages:DocumentPage[]):Promise<{blocks:DocumentBlock[];unmapped:number}>{
 const parts=await readOfficeParts(input.path,name=>name==='word/document.xml');const xml=parts['word/document.xml'];if(!xml)return{blocks:[],unmapped:0};
 const formulas=extractFormulas(xml).slice(0,MAX_FORMULAS),located=locateFormulas(formulas,pages),ref={workspaceId:input.workspaceId,documentId:input.documentId,version:input.version};
 const blocks:DocumentBlock[]=[];let unmapped=0;
 formulas.forEach((formula,index)=>{const page=located[index]!;if(!page){unmapped++;return;}blocks.push({id:'formula-'+(index+1),text:formulaText(formula),kind:'formula',anchor:{...ref,location:{kind:'page',page}}});});
 return{blocks,unmapped};
}
export function formulaText(formula:ExtractedFormula){return formula.display?'$$'+formula.latex+'$$':'$'+formula.latex+'$';}
