import {readFile} from 'node:fs/promises';
import {strFromU8} from 'fflate';
import {boundedUnzip} from './bounded-zip.js';
import type {DocumentBlock,DocumentPage,VersionedFile} from '../../../contracts/src/documents.js';
import {extractFormulas,type ExtractedFormula} from './omml.js';
const MAX_PART_BYTES=16*1024*1024,MAX_FORMULAS=2000;
/** Reads selected XML parts of an Office zip, enforcing limits on actual expanded bytes. */
export async function readOfficeParts(path:string,wanted:(name:string)=>boolean):Promise<Record<string,string>>{
 const zip=boundedUnzip(new Uint8Array(await readFile(path)),{filter:wanted,limits:{maxEntryBytes:MAX_PART_BYTES,maxTotalBytes:64*1024*1024}});
 return Object.fromEntries(Object.entries(zip).map(([name,bytes])=>[name,strFromU8(bytes)]));
}
const squash=(text:string)=>text.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
/**
 * Locates an element only when its complete own paragraph/cell context occurs on exactly one rendered page.
 * A preceding paragraph may be on another page; repeated or split context is not proof of a page location.
 * Ambiguous elements return page 0 so the caller can retain the rendered page as the authoritative source.
 */
export function locateFormulas(items:ReadonlyArray<{context:string;before:string}>,pages:Pick<DocumentPage,'page'|'text'>[]):number[]{
 const texts=pages.map(page=>squash(page.text));
 return items.map(item=>{const context=squash(item.context);if(context.length<6)return 0;
  const matches=texts.flatMap((text,index)=>text.includes(context)?[pages[index]!.page]:[]);return matches.length===1?matches[0]!:0;
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
