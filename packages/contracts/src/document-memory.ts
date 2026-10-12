import {z} from 'zod';
import type {DocumentRef} from './documents.js';
import {ReaderError} from './errors.js';
const text=z.string().refine(value=>Buffer.byteLength(value,'utf8')<=65536);
const pageNumber=z.number().int().min(1);
export const memoryPageSchema=z.object({page:pageNumber,summary:text,transcription:text,figures:z.array(text).max(200),formulas:z.array(text).max(200),terms:z.array(text).max(200),uncertainties:z.array(text).max(200),crossPageRelations:z.array(z.object({pages:z.array(pageNumber).min(1).max(1000),text}).strict()).max(200)}).strict();
export type DocumentMemoryPage=z.infer<typeof memoryPageSchema>;
const recordSchema=z.object({schemaVersion:z.literal(1),document:z.object({workspaceId:z.string(),documentId:z.string(),version:z.string()}).strict(),pluginId:z.string(),promptVersion:z.string(),modelIdentity:z.string(),generation:z.number().int().min(0),pageCount:z.number().int().min(1).max(100000),status:z.enum(['partial','ready']),pages:z.array(memoryPageSchema),completedPages:z.array(pageNumber),batches:z.array(z.object({pages:z.array(pageNumber).min(1),completedAt:z.string().datetime()}).strict()),overview:text,createdAt:z.string().datetime(),updatedAt:z.string().datetime()}).strict();
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
 if(record.status==='ready'&&(completed.length!==record.pageCount||!record.overview.trim()))return invalid();
 return structuredClone(record) as DocumentMemoryRecord;
}
