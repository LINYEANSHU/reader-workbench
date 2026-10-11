import {readFile} from 'node:fs/promises';
import {posix} from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
export async function extractNotes(path:string):Promise<Array<{page:number;text:string;id:string}>>{
 let remaining=64*1024*1024;
 const zip=unzipSync(new Uint8Array(await readFile(path)),{filter:file=>{
  const wanted=/^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/.test(file.name);
  if(!wanted||file.originalSize>2*1024*1024||file.originalSize>remaining)return false;remaining-=file.originalSize;return true;
 }});
 const parser=new XMLParser({ignoreAttributes:false,processEntities:false});
 const parse=(name:string)=>zip[name]?parser.parse(strFromU8(zip[name]!)):null;
 const array=<T>(value:T|T[]|undefined):T[]=>value===undefined?[]:Array.isArray(value)?value:[value];
 const collect=(value:unknown):string[]=>{
  if(!value||typeof value!=='object')return [];return Object.entries(value).flatMap(([key,item])=>key==='a:t'?[String(item)]:Array.isArray(item)?item.flatMap(collect):collect(item));
 };
 const presentation=parse('ppt/presentation.xml');
 const relationships=array(parse('ppt/_rels/presentation.xml.rels')?.Relationships?.Relationship);
 const slides=array(presentation?.['p:presentation']?.['p:sldIdLst']?.['p:sldId']);
 const mapping=new Map<string,number>();
 slides.forEach((slide,index)=>{
  const relation=relationships.find(item=>item['@_Id']===slide['@_r:id']);if(!relation||relation['@_TargetMode']==='External')return;
  const slidePath=posix.normalize(posix.join('ppt',relation['@_Target']));
  const relationsPath=posix.join(posix.dirname(slidePath),'_rels',posix.basename(slidePath)+'.rels');
  const notesRelation=array(parse(relationsPath)?.Relationships?.Relationship).find(item=>String(item['@_Type']).endsWith('/notesSlide')&&item['@_TargetMode']!=='External');
  if(notesRelation)mapping.set(posix.normalize(posix.join(posix.dirname(slidePath),notesRelation['@_Target'])),index+1);
 });
 return Object.entries(zip).filter(([name])=>name.startsWith('ppt/notesSlides/')).map(([id,bytes])=>({id:posix.basename(id),page:mapping.get(id)??0,text:collect(parser.parse(strFromU8(bytes))).join('\n')}));
}
