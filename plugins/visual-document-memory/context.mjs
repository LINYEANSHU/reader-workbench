const size=value=>Buffer.byteLength(value,'utf8');
const clipBytes=(value,limit)=>{let used=0,end=0;for(const character of value){const bytes=size(character);if(used+bytes>limit)break;used+=bytes;end+=character.length;}return value.slice(0,end);};
function pageRanges(pages){const sorted=[...pages].sort((a,b)=>a-b),parts=[];for(let index=0;index<sorted.length;){let end=index;while(end+1<sorted.length&&sorted[end+1]===sorted[end]+1)end++;parts.push(end>index?sorted[index]+'-'+sorted[end]:String(sorted[index]));index=end+1;}return parts.join(',');}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Chinese questions have no spaces: score overlapping Han bigrams, Latin words and whole numbers (3 never matches 30),
// weighted by how few pages contain them, so words shared by every page do not decide the ranking.
function queryTerms(question){
 const text=question.normalize('NFKC').toLowerCase(),terms=new Map();
 for(const word of text.match(/[a-z][a-z0-9_]+/g)??[])terms.set(word,{weight:word.length,test:page=>page.includes(word)});
 for(const number of text.match(/\d+(?:\.\d+)*/g)??[]){const pattern=new RegExp('(?<![\\d.])'+escape(number)+'(?!\\.?\\d)');terms.set('#'+number,{weight:4+number.length,test:page=>pattern.test(page)});}
 for(const run of text.match(/\p{Script=Han}+/gu)??[])for(let index=0;index<run.length-1;index++){const pair=run.slice(index,index+2);terms.set(pair,{weight:2,test:page=>page.includes(pair)});}
 return[...terms.values()];
}
export function rankPages(pages,question){
 const texts=pages.map(page=>JSON.stringify(page).normalize('NFKC').toLowerCase()),scores=pages.map(()=>0);
 for(const term of queryTerms(question)){const matches=texts.map(term.test),count=matches.filter(Boolean).length;if(!count)continue;const idf=Math.log(1+pages.length/count);matches.forEach((matched,index)=>{if(matched)scores[index]+=term.weight*idf;});}
 return pages.map((page,index)=>({page,score:scores[index]})).sort((a,b)=>b.score-a.score||a.page.page-b.page.page);
}
export function select(record,question,budgetBytes){const header='本地文档阅读记忆（模型根据原文文字或页图像整理，可能存在识别误差；原文可回查）：\n'+JSON.stringify(record.document)+'\n已读 '+record.completedPages.length+' / '+record.pageCount+' 页；未读页面不在记忆中。\n';const full=header+record.overview+'\n'+record.pages.map(page=>JSON.stringify(page)).join('\n');if(size(full)<=budgetBytes)return{text:full,pages:record.completedPages};
 // Within a tight budget (several documents share one) the overview is shortened, and below that only a pointer to
 // the memory tools is sent: a large memory never fails the question.
 const index=pageRanges(record.pages.map(page=>page.page)),tools='本轮仅附相关页记忆；需要其他细节时调用 search_document_memory 或 read_document_memory，需要验证图形时调用 revisit_document_page。\n';
 const layout=overview=>header+'已读范围概览：'+overview+'\n已建立记忆的页码：'+index+'\n'+tools;let text=layout(record.overview);
 if(size(text)>budgetBytes){const room=budgetBytes-size(layout(''))-size('…（概览已截断）');
  if(room>=256)text=layout(clipBytes(record.overview,room)+'…（概览已截断）');
  else{const pointer=header+'本轮容量不足以附带记忆；请调用 search_document_memory 或 read_document_memory 读取已读页。\n';return size(pointer)<=budgetBytes?{text:pointer,pages:[]}:{text:'',pages:[]};}}
 const pages=[];let used=size(text);
 for(const item of rankPages(record.pages,question)){const value=JSON.stringify(item.page)+'\n',cost=size(value);if(used+cost<=budgetBytes){text+=value;used+=cost;pages.push(item.page.page);}}return{text,pages};}
