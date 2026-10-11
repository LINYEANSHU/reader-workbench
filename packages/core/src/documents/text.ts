import {readFile} from 'node:fs/promises';
import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
import type {VersionedFile,ParsedDocument,DocumentBlock} from '../../../contracts/src/documents.js';
export function textParsed(input:VersionedFile,text:string,markdown=false):ParsedDocument{
  const ref={workspaceId:input.workspaceId,documentId:input.documentId,version:input.version};
  let offset=0;const blocks:DocumentBlock[]=text.split(/\n\s*\n/).filter(Boolean).map((part,index)=>{
    const start=text.indexOf(part,offset);offset=start+part.length;
    return {id:'b'+index,text:part,kind:markdown?'markdown':'text',anchor:{...ref,location:{kind:'block',blockId:'b'+index,start:0,end:part.length}}};
  });
  return {pages:[{page:1,text,width:0,height:0,anchors:blocks.map(block=>block.anchor)}],blocks,warnings:[]};
}
export const textAdapter:DocumentAdapter={supports:mime=>mime==='text/plain',parse:async(input,signal)=>textParsed(input,await readFile(input.path,{encoding:'utf8',signal}))};
