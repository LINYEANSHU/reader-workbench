import type {DocumentBlock,DocumentPage,VersionedFile} from '../../../contracts/src/documents.js';
import {parseOrderedXml,tagOf,childrenOf,attribute,child,textContent,ommlToLatex,type XmlNode} from './omml.js';
import {readOfficeParts,locateFormulas} from './office-math.js';
// Tables read from word/document.xml. In the PDF rendering a table's cells come out as interleaved runs of text;
// the source keeps rows, columns, merged cells and cell formulas.
export interface ExtractedTable {markdown:string;context:string;before:string}
const MAX_TABLES=500,MAX_ROWS=200,MAX_CELL=500;
/** Text of a Word paragraph-holding node; formulas become $LaTeX$ when withMath, else are left out (as PDF text would scatter them). */
function wordText(node:XmlNode,withMath:boolean):string{
 const visit=(item:XmlNode):string=>{const tag=tagOf(item);
  if(tag==='w:t')return textContent(item);if(tag==='w:tab')return ' ';if(tag==='w:br'||tag==='w:cr')return ' ';
  if(tag==='m:oMath'||tag==='m:oMathPara'){if(!withMath)return ' ';const latex=ommlToLatex(item).trim();return latex?'$'+latex+'$':'';}
  if(tag==='w:p')return childrenOf(item).map(visit).join('')+' ';if(tag?.endsWith('Pr')||tag==='w:delText'||tag==='mc:Fallback')return '';
  return childrenOf(item).map(visit).join('');};
 return visit(node).replace(/\s+/g,' ').trim();
}
const clip=(text:string)=>text.length>MAX_CELL?text.slice(0,MAX_CELL)+'…':text;
function tableRows(table:XmlNode):string[][]{
 return childrenOf(table).filter(item=>tagOf(item)==='w:tr').slice(0,MAX_ROWS).map(row=>childrenOf(row).filter(item=>tagOf(item)==='w:tc').flatMap(tableCell=>{
  const properties=child(tableCell,'w:tcPr'),span=Math.max(1,Math.min(64,Number(attribute(child(properties??{},'w:gridSpan')??{},'w:val'))||1)),merge=child(properties??{},'w:vMerge');
  // A vertically merged continuation cell repeats nothing; its content lives in the cell where the merge starts.
  const text=merge&&attribute(merge,'w:val')!=='restart'?'':wordText(tableCell,true);
  return [clip(text),...Array<string>(span-1).fill('')];}));
}
function markdown(rows:string[][]):string{
 // Cells keep their raw text for locating the table; only the Markdown escapes the column separator.
 const width=Math.max(...rows.map(row=>row.length)),line=(row:string[])=>'| '+Array.from({length:width},(_,index)=>(row[index]??'').replace(/\|/g,'\\|')).join(' | ')+' |';
 return [line(rows[0]!),'| '+Array(width).fill('---').join(' | ')+' |',...rows.slice(1).map(line)].join('\n');
}
/** Top-level tables of a document part in order, each with text that locates it on a rendered page. */
export function extractTables(xml:string):ExtractedTable[]{
 const output:ExtractedTable[]=[];let previous='';
 const visit=(node:XmlNode)=>{const tag=tagOf(node);
  if(tag==='w:p'){const text=wordText(node,false);if(text)previous=text;return;}
  if(tag==='w:tbl'){const rows=tableRows(node).filter(row=>row.some(Boolean));if(rows.length&&output.length<MAX_TABLES){
    const plain=(row:string[])=>row.map(text=>text.replace(/\$[^$]*\$/g,' ').trim()).filter(Boolean);
    const candidates=rows.slice(0,2).flatMap(plain).sort((a,b)=>b.length-a.length),context=candidates[0]&&candidates[0].length>=6?candidates[0]:plain(rows[0]!).join('');
    output.push({markdown:markdown(rows),context,before:previous});}return;}
  for(const item of childrenOf(node))visit(item);};
 for(const node of parseOrderedXml(xml))visit(node);
 return output;
}
export function tableBlocks(xml:string,input:VersionedFile,pages:Pick<DocumentPage,'page'|'text'>[]):{blocks:DocumentBlock[];unmapped:number}{
 const tables=extractTables(xml),located=locateFormulas(tables,pages),ref={workspaceId:input.workspaceId,documentId:input.documentId,version:input.version},blocks:DocumentBlock[]=[];let unmapped=0;
 tables.forEach((table,index)=>{const page=located[index]!;if(!page){unmapped++;return;}blocks.push({id:'table-'+(index+1),text:table.markdown,kind:'table',anchor:{...ref,location:{kind:'page',page}}});});
 return{blocks,unmapped};
}
/** Table blocks for a .docx whose pages come from a PDF rendering. */
export async function docxTableBlocks(input:VersionedFile,pages:Pick<DocumentPage,'page'|'text'>[]){const xml=(await readOfficeParts(input.path,name=>name==='word/document.xml'))['word/document.xml'];return xml?tableBlocks(xml,input,pages):{blocks:[],unmapped:0};}
