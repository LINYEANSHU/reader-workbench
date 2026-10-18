import {z} from 'zod';
import type {DocumentRef,SourceAnchor} from './documents.js';
import {ReaderError} from './errors.js';
const text=z.string().refine(value=>Buffer.byteLength(value,'utf8')<=65536);
const pageNumber=z.number().int().min(1);
const entrySource=z.discriminatedUnion('kind',[z.object({kind:z.literal('page'),page:pageNumber}).strict(),z.object({kind:z.literal('block'),blockId:z.string().min(1).max(200),start:z.number().int().min(0),end:z.number().int().min(0)}).strict()]);
export const memoryPageSchema=z.object({page:pageNumber,summary:text,transcription:text,figures:z.array(text).max(200),formulas:z.array(text).max(200),terms:z.array(text).max(200),uncertainties:z.array(text).max(200),crossPageRelations:z.array(z.object({pages:z.array(pageNumber).min(1).max(1000),text}).strict()).max(200),entries:z.array(z.object({kind:z.enum(['formula','figure','term']),text,source:entrySource}).strict()).max(600).optional()}).strict();
export type DocumentMemoryPage=z.infer<typeof memoryPageSchema>;
const recordSchema=z.object({schemaVersion:z.literal(1),document:z.object({workspaceId:z.string(),documentId:z.string(),version:z.string()}).strict(),pluginId:z.string(),promptVersion:z.string(),modelIdentity:z.string(),generation:z.number().int().min(0),pageCount:z.number().int().min(1).max(100000),status:z.enum(['partial','ready']),pages:z.array(memoryPageSchema),completedPages:z.array(pageNumber),batches:z.array(z.object({pages:z.array(pageNumber).min(1),completedAt:z.string().datetime()}).strict()),overview:text,overviewPages:z.array(pageNumber).min(1).optional(),createdAt:z.string().datetime(),updatedAt:z.string().datetime()}).strict();
export interface DocumentMemoryRecord extends Omit<z.infer<typeof recordSchema>,'document'>{document:DocumentRef}
export interface DocumentMemoryReference {document:DocumentRef;pluginId:string;cacheKey:string;generation:number;pageCount:number;completedPages:number[];status:'partial'|'ready'}
export interface MemoryExpectation {document:DocumentRef;modelIdentity:string;pluginId:string;promptVersion:string;pageCount:number;generation:number}
export function validateMemoryRecord(value:unknown,expected:MemoryExpectation,maximumBytes=64*1024*1024):DocumentMemoryRecord{
 const invalid=()=>{throw new ReaderError('DOCUMENT_MEMORY_INVALID','文档记忆结构或页码覆盖范围无效');};
 let serialized:string;try{serialized=JSON.stringify(value);}catch{return invalid();}if(!serialized||Buffer.byteLength(serialized)>maximumBytes)return invalid();
 const parsed=recordSchema.safeParse(value);if(!parsed.success)return invalid();const record=parsed.data;
 for(const field of ['workspaceId','documentId','version'] as const)if(record.document[field]!==expected.document[field])return invalid();
 for(const field of ['modelIdentity','pluginId','promptVersion','pageCount','generation'] as const)if(record[field]!==expected[field])return invalid();
 const validPages=(pages:number[])=>pages.every(page=>page<=record.pageCount)&&new Set(pages).size===pages.length;
 const pages=record.pages.map(page=>page.page),completed=record.completedPages,batches=record.batches.flatMap(batch=>batch.pages);
 if(!validPages(pages)||!validPages(completed)||!validPages(batches)||pages.length!==completed.length||completed.some(page=>!pages.includes(page))||batches.length!==completed.length||batches.some(page=>!completed.includes(page)))return invalid();
 if(record.pages.some(page=>page.crossPageRelations.some(relation=>!validPages(relation.pages))))return invalid();
 if(record.pages.some(page=>page.entries?.some(entry=>entry.source.kind==='page'?entry.source.page!==page.page:entry.source.end<entry.source.start)))return invalid();
 if(record.overviewPages&&(!record.overview.trim()||!validPages(record.overviewPages)||record.overviewPages.some(page=>!completed.includes(page))))return invalid();
 if(record.status==='ready'&&(completed.length!==record.pageCount||!record.overview.trim()))return invalid();
 return structuredClone(record) as DocumentMemoryRecord;
}

export function scopedMemoryOverview(record:DocumentMemoryRecord,pages:number[]):string{
 const source=record.overviewPages??record.completedPages;return source.length===pages.length&&pages.every(page=>source.includes(page))?record.overview:'';
}

export type DocumentMemoryEntryKind='formula'|'figure'|'term';
export interface DocumentMemoryEntry {id:string;kind:DocumentMemoryEntryKind;text:string;anchor:SourceAnchor;granularity:'page'|'block';score:number}
export interface DocumentMemorySearchResult {entries:DocumentMemoryEntry[];completedPages:number[];pageCount:number}
const normalized=(value:string)=>value.normalize('NFKC').toLowerCase();
/** Numbers are complete tokens; Chinese descriptions also contribute overlapping bigrams. */
export function memorySearchScore(text:string,query:string):number{
 const source=normalized(text),question=normalized(query).trim();if(!question)return 1;
 const numbers=question.match(/\d+(?:\.\d+)*/g)??[],sourceNumbers=new Set(source.match(/\d+(?:\.\d+)*/g)??[]);
 if(numbers.some(number=>!sourceNumbers.has(number)))return 0;
 const terms=question.match(/[a-z_]+|\p{Script=Han}+/gu)??[];
 let score=source.includes(question)?question.length*8:0;
 for(const term of terms){if(source.includes(term))score+=term.length*3;else if(/\p{Script=Han}/u.test(term))for(let i=0;i<term.length-1;i++)if(source.includes(term.slice(i,i+2)))score+=2;}
 return score+numbers.length*4;
}
export function searchMemoryEntries(record:DocumentMemoryRecord,query:string,kind?:DocumentMemoryEntryKind,limit=50):DocumentMemoryEntry[]{
 if(query.length>1000)return[];const entries:DocumentMemoryEntry[]=[];
 for(const page of record.pages){if(!record.completedPages.includes(page.page))continue;
  const derived=(['formula','figure','term'] as const).flatMap(kind=>(page[kind==='formula'?'formulas':kind==='figure'?'figures':'terms']).map(text=>({kind,text,source:{kind:'page' as const,page:page.page}})));
  const items=page.entries?.length?page.entries:derived;
  for(const [index,item]of items.entries()){if(kind&&kind!==item.kind)continue;const score=memorySearchScore(item.text,query);if(!score)continue;entries.push({id:page.page+':'+item.kind+':'+index,kind:item.kind,text:item.text,anchor:{...record.document,location:structuredClone(item.source)},granularity:item.source.kind,score});}
 }
 return entries.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id,undefined,{numeric:true})).slice(0,Math.max(1,Math.min(limit,200)));
}
