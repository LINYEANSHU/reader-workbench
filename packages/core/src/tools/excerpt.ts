// Tool results are committed with the turn and resent with later questions, so they return bounded excerpts;
// the full text stays one read_document_block / read_document_page call away.
export const SEARCH_EXCERPT_CHARS=600;
export const PAGE_READ_CHARS=12000;
export const HISTORY_ANSWER_CHARS=4000;
function queryCandidates(query:string):string[]{
 const value=query.normalize('NFKC').toLowerCase().trim(),han=value.match(/\p{Script=Han}{2,}/gu)??[];
 const terms=[value,...(value.match(/[a-z][a-z0-9_]+|\d+(?:\.\d+)*/g)??[]),...han,...han.flatMap(run=>Array.from({length:run.length-1},(_,index)=>run.slice(index,index+2)))];
 return [...new Set(terms.filter(Boolean))].sort((a,b)=>b.length-a.length);
}
/** A window of the text around the longest query term it contains, or its beginning when nothing matches. */
export function excerptAround(text:string,query:string,limit=SEARCH_EXCERPT_CHARS):{text:string;truncated:boolean}{
 if(text.length<=limit)return{text,truncated:false};
 const lower=text.toLowerCase();let at=-1;for(const term of queryCandidates(query)){at=lower.indexOf(term);if(at>=0)break;}
 const start=at<0?0:Math.max(0,Math.min(at-Math.floor(limit/3),text.length-limit)),end=start+limit;
 return{text:(start>0?'…':'')+text.slice(start,end)+(end<text.length?'…':''),truncated:true};
}
/** One bounded slice of a page; the note names the offset that continues it. */
export function pageSlice(text:string,offset=0,limit=PAGE_READ_CHARS):string{
 if(offset>=text.length&&offset>0)return '[offset '+offset+' 超出本页长度 '+text.length+'，本页没有更多文字]';
 const slice=text.slice(offset,offset+limit),rest=text.length-offset-slice.length;
 return slice+(rest>0?'\n[本页还有 '+rest+' 字未返回；需要时再次调用 read_document_page 并传 offset: '+(offset+slice.length)+']':'');
}
export function clip(text:string,limit:number):string{return text.length<=limit?text:text.slice(0,limit)+'…[已截断，原文共 '+text.length+' 字]';}
