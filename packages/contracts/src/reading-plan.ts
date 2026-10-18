import type {DocumentRecord} from './documents.js';
import {ReaderError} from './errors.js';

export interface ReadingPlan {pages:number[];pageCount:number;mode:'visual'|'text';configured:boolean}
export function readingMode(record:Pick<DocumentRecord,'relativePath'|'mime'|'viewer'>):ReadingPlan['mode']{
 return /\.(?:docx?|md|markdown|txt)$/i.test(record.relativePath)||['markdown','text'].includes(record.viewer.kind)||record.mime.startsWith('text/')?'text':'visual';
}
export function normalizeReadingPages(pages:unknown,total:number):number[]{
 if(!Number.isSafeInteger(total)||total<1||total>100000||!Array.isArray(pages)||!pages.length||pages.length>100000||pages.some(page=>!Number.isSafeInteger(page)||page<1||page>total))throw new ReaderError('INVALID_READING_PLAN','阅读页码必须处于 1–'+total+' 页内，且至少选择一页');
 return [...new Set(pages as number[])].sort((a,b)=>a-b);
}
/** Parse inclusive ranges, keeping the page count bounded before expanding. */
export function parsePageRanges(input:string,total:number):number[]{
 if(typeof input!=='string'||input.length>20000||!Number.isSafeInteger(total)||total<1||total>100000)throw new ReaderError('INVALID_READING_PLAN','阅读范围无效');
 const values=new Set<number>();
 for(const part of input.normalize('NFKC').split(/[,，、]/)){
  const match=/^\s*(\d+)\s*(?:[-–—]\s*(\d+)\s*)?$/.exec(part);
  if(!match)throw new ReaderError('INVALID_READING_PLAN','请使用页码或范围，例如 2-3,10-15');
  const first=Number(match[1]),last=Number(match[2]??match[1]);
  if(first<1||last<first||last>total)throw new ReaderError('INVALID_READING_PLAN','页码范围超出文档或顺序无效');
  for(let page=first;page<=last;page++)values.add(page);
 }
 return normalizeReadingPages([...values],total);
}
