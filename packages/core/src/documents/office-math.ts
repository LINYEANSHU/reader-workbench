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
 * Finds the rendered page of each source element (formula, table) from its own text, else from the paragraph before it
 * (which may sit at the foot of the previous page), moving forward through the document so repeated phrases resolve to
 * the next occurrence. Elements without findable text return page 0.
 */
export function locateFormulas(items:ReadonlyArray<{context:string;before:string}>,pages:Pick<DocumentPage,'page'|'text'>[]):number[]{
 const texts=pages.map(page=>squash(page.text));let cursor=0;
 const find=(value:string)=>{const text=squash(value);if(text.length<6)return -1;const probes=[text.slice(0,24),text.slice(-24)];for(let offset=0;offset<texts.length;offset++){const index=(cursor+offset)%texts.length;if(probes.some(probe=>texts[index]!.includes(probe)))return index;}return -1;};
 return items.map(item=>{let index=find(item.context);if(index<0)index=find(item.before);if(index<0)return 0;cursor=index;return pages[index]!.page;});
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
