import MarkdownIt from 'markdown-it';
const encoder=new TextEncoder(),decoder=new TextDecoder(),markdownParser=new MarkdownIt();
function preserveCodeBlocks(text,keep,prose=value=>value){
 const offsets=[0];for(const match of text.matchAll(/\n/g))offsets.push(match.index+1);
 const ranges=markdownParser.parse(text,{}).filter(token=>['code_block','fence'].includes(token.type)&&token.map).map(token=>({start:offsets[token.map[0]],end:offsets[token.map[1]]??text.length}));
 let position=0,result='';for(const range of ranges){result+=prose(text.slice(position,range.start))+keep(text.slice(range.start,range.end));position=range.end;}return result+prose(text.slice(position));
}
const fail=(code,message)=>{throw Object.assign(new Error(message),{code:'TRANSLATION_'+code});};
export function supportsDocument(document){return /\.(md|markdown|txt|doc|docx|pdf|ppt|pptx)$/i.test(document.relativePath);}
export function validateTranslations(values,expected){if(!Array.isArray(values)||values.length!==expected.length)fail('COVERAGE','译文未完整覆盖全部编号块，无法保存');const ids=new Set(expected),result=new Map();for(const block of values){if(!block||typeof block.id!=='string'||!ids.has(block.id)||result.has(block.id)||typeof block.text!=='string'||!block.text.trim())fail('COVERAGE','译文编号缺失、重复或含未授权编号');result.set(block.id,block.text);}return result;}
function protect(text){
 const originals=[],keep=value=>{const id='__RW_KEEP_'+originals.length+'__';originals.push(value);return id;};
 const inline=value=>value.replace(/\$(?:\\.|[^$\r\n])+\$|`+[^`\r\n]*`+|\\[\\`*_{}\[\]()#+.!|>~-]|[*_~]+|\|/g,keep);
 const pattern=/```[^\r\n]*\r?\n[\s\S]*?(?:```[^\r\n]*(?=\r?\n|$)|$)|~~~[^\r\n]*\r?\n[\s\S]*?(?:~~~[^\r\n]*(?=\r?\n|$)|$)|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|`+[^`\r\n]*`+|\$(?:\\.|[^$\r\n])+\$|!\[[^\]]*\]\((?:[^()\r\n]|\([^()\r\n]*\))*\)|!\[[^\]]*\]\[[^\]]*\]|<[^>]+>|(\[[^\]\r\n]+\])(\((?:[^()\r\n]|\([^()\r\n]*\))*\)|\[[^\]\r\n]*\])|\\[\\`*_{}\[\]()#+.!|>~-]|[*_~]+|\|/g;
 const masked=preserveCodeBlocks(text,keep,part=>part.replace(pattern,(value,label,target)=>label?keep('[')+inline(label.slice(1,-1))+keep(']'+target):keep(value)));
 return{masked,originals,restore(value){
  if(JSON.stringify(value.match(/__RW_KEEP_\d+__/g)??[])!==JSON.stringify(masked.match(/__RW_KEEP_\d+__/g)??[]))fail('PROTECTED','模型没有原样保留代码、公式或资源标记的顺序');
  return value.replace(/__RW_KEEP_(\d+)__/g,(_all,index)=>{if(!originals[Number(index)])fail('PROTECTED','模型返回了未知保护标记');return originals[Number(index)];});
 }};
}
function parseResponse(text){try{const clean=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');const value=JSON.parse(clean);return value.translations;}catch{fail('PROTOCOL','模型未返回有效的编号译文 JSON');}}
async function translateBlocks(host,blocks,signal){const result=new Map(),system='DOCUMENT_TRANSLATION_BLOCKS\nTranslate every numbered block into '+host.targetLanguage+'. Return exactly JSON {"translations":[{"id":"unchanged id","text":"full translation"}]}. Keep every __RW_KEEP_n__ token exactly once, unchanged and in its original position relative to adjacent text. Preserve Markdown structure, numbering and inline link labels. Do not summarize, omit, add commentary or invent IDs. Translate prose only; preserve mathematical symbols and numeric values.';const limit=Math.max(1,Math.min(48_000,host.inputBudgetBytes-encoder.encode(system).length-2000));let completed=0;
 for(let index=0;index<blocks.length;){signal.throwIfAborted();const batch=[];let size=0;while(index<blocks.length&&batch.length<512){const block=blocks[index],length=encoder.encode(JSON.stringify(block)).length+4;if(length>limit)fail('INPUT_LIMIT','单个正文块超过模型输入预算，请缩小选区或拆分文档');if(batch.length&&size+length>limit)break;batch.push(block);size+=length;index++;}const request={messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({targetLanguage:host.targetLanguage,blocks:batch})}],tools:[],toolChoice:'none'};let text='';for await(const event of host.generate(request,signal)){signal.throwIfAborted();if(event.kind==='tool-call')fail('PROTOCOL','翻译过程中不能调用模型工具');if(event.kind==='delta'){text+=event.text;if(encoder.encode(text).length>16*1024*1024)fail('OUTPUT_LIMIT','单批译文超过安全大小，请缩小处理范围');}}const values=validateTranslations(parseResponse(text),batch.map(block=>block.id));for(const [id,value]of values)result.set(id,value);completed+=batch.length;host.progress({completed,total:blocks.length,label:'已翻译 '+completed+' / '+blocks.length+' 块'});}
 return result;
}
const xmlDecode=text=>text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_match,entity)=>entity[0]==='#'?String.fromCodePoint(entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity]??_match));
const xmlEncode=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const baseName=host=>host.document.relativePath.replaceAll('\\','/').split('/').at(-1).replace(/\.[^.]+$/,'')+'-'+host.targetLanguage.replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,24);
async function portableMarkdown(host,text,signal){
 // Code examples are literal text, never resource references from the snapshot.
 const examples=[];let marker='__RW_CODE_EXAMPLE_';while(text.includes(marker))marker+='_';
 const keep=value=>{const id=marker+examples.length+'__';examples.push(value);return id;};
 text=preserveCodeBlocks(text,keep,part=>part.replace(/`+[^`\r\n]*`+/g,keep));
 // Use the same Markdown parser as resource snapshots, including normalized URLs.
 const parser=new MarkdownIt(),images=[],resources=new Map(),imageRule=parser.inline.ruler.getRules('').find(rule=>rule.name==='image');
 parser.inline.ruler.at('image',(state,silent)=>{const start=state.pos,labelEnd=state.md.helpers.parseLinkLabel(state,start+1,false),matched=imageRule(state,silent);if(matched&&!silent){const token=state.tokens.at(-1),name=token.attrGet('src');images.push({raw:state.src.slice(start,state.pos),name,inline:state.src[labelEnd+1]==='(',alt:token.content,title:token.attrGet('title')});resources.set(name,null);}return matched;});
 parser.parse(text,{});
 for(const name of resources.keys()){signal.throwIfAborted();if(/^(?:https?:|data:|\/|#)/i.test(name))continue;let resource;try{resource=await host.readResource(name);}catch{fail('RESOURCE','Markdown 引用图片未能读取，请检查原文件的资源路径');}if(!resource.mime.startsWith('image/'))fail('RESOURCE','Markdown 图片资源类型无效');resources.set(name,'data:'+resource.mime+';base64,'+Buffer.from(resource.bytes).toString('base64'));}
 const replacements=[];for(const match of text.matchAll(/^ {0,3}\[[^\]]+\]:[ \t]*/gm)){const start=match.index+match[0].length,destination=parser.helpers.parseLinkDestination(text,start,text.length);if(destination.ok){const embedded=resources.get(parser.normalizeLink(destination.str));if(embedded)replacements.push({start,end:destination.pos,value:embedded});}}
 for(const replacement of replacements.toReversed())text=text.slice(0,replacement.start)+replacement.value+text.slice(replacement.end);
 for(const image of images)if(image.inline&&resources.get(image.name))text=text.replaceAll(image.raw,'!['+image.alt+']('+resources.get(image.name)+(image.title?' '+JSON.stringify(image.title):'')+')');
 return text.replace(new RegExp(marker+'(\\d+)__','g'),(_all,index)=>examples[Number(index)]);
}
async function markdown(host,signal,source){
 const protectedText=protect(source),lines=protectedText.masked.split(/(\r?\n)/),blocks=[],positions=[];
 const tableRow=line=>{
  const pipes=[...line.matchAll(/__RW_KEEP_(\d+)__/g)].filter(match=>protectedText.originals[Number(match[1])]==='|');if(!pipes.length)return;
  const cells=[];let start=0;for(const pipe of pipes){cells.push({start,end:pipe.index,text:line.slice(start,pipe.index)});start=pipe.index+pipe[0].length;}cells.push({start,end:line.length,text:line.slice(start)});
  if(!cells[0].text.trim())cells.shift();if(cells.length&&!cells.at(-1).text.trim())cells.pop();return cells;
 };
 const addCells=(index,cells)=>{for(const cell of cells){const leading=cell.text.match(/^\s*/)[0],trailing=cell.text.match(/\s*$/)[0],text=cell.text.trim();if(!text||/^__RW_KEEP_\d+__$/.test(text))continue;const id='md-'+blocks.length;blocks.push({id,text});positions.push({index,id,start:cell.start,end:cell.end,leading,trailing,cell:true});}};
 let frontMatter=false,tableColumns=0;
 for(let index=0;index<lines.length;index+=2){
  const line=lines[index];if(index===0&&line==='---'){frontMatter=true;continue;}if(frontMatter){if(line==='---'||line==='...')frontMatter=false;continue;}
  const cells=tableRow(line);
  if(tableColumns){if(cells?.length===tableColumns){addCells(index,cells);continue;}tableColumns=0;}
  const divider=tableRow(lines[index+2]??''),rawStart=line.replace(/__RW_KEEP_(\d+)__/g,(_all,id)=>protectedText.originals[Number(id)]);
  if(cells?.length&&divider?.length===cells.length&&!/^(?: {4}|\t| {0,3}(?:#{1,6}(?:\s|$)|>|(?:[-+*]|\d+[.)])\s))/.test(rawStart)&&!/^ {4}|^\t/.test(lines[index+2]??'')&&divider.every(cell=>/^:?-+:?$/.test(cell.text.trim()))){addCells(index,cells);tableColumns=cells.length;index+=2;continue;}
  if(!line.trim()||/^\s*(?:\[[^\]]+\]:|(?:[-:*|]\s*)+$|__RW_KEEP_\d+__\s*$)/.test(line))continue;
  const prefix=line.match(/^(?:\s*(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+))*/)?.[0]??'',text=line.slice(prefix.length);if(!text.trim())continue;const id='md-'+blocks.length;blocks.push({id,text});positions.push({index,id,prefix});
 }
 const translated=await translateBlocks(host,blocks,signal);
 for(const position of positions.toReversed()){
  const value=translated.get(position.id);if(position.cell){if(/[\r\n|]/.test(value))fail('PROTECTED','模型改变了 Markdown 表格的单元格结构');lines[position.index]=lines[position.index].slice(0,position.start)+position.leading+value.trim()+position.trailing+lines[position.index].slice(position.end);}else lines[position.index]=position.prefix+value;
 }
 const text=await portableMarkdown(host,protectedText.restore(lines.join('')),signal);return{name:baseName(host)+'.md',mime:'text/markdown',extension:'.md',bytes:encoder.encode(text),previewText:text,warnings:[]};
}
function docxSpans(xml){
 // Keep original XML offsets so only editable text nodes change; never reserialize media or OMML.
 const spans=[],ignored=[],protectedTags=new Set(['w:fldSimple','w:instrText','w:drawing','w:pict','w:object','m:oMath','m:oMathPara','mc:AlternateContent']);
 let nodes=[],paragraphDepth=0,fieldDepth=0;
 const flush=()=>{const text=nodes.map(node=>node.text).join('');if(text.trim())spans.push({text,nodes});nodes=[];};
 const tokens=/<w:t\b(?:[^>"']|"[^"]*"|'[^']*')*\/\s*>|<w:t\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/w:t\s*>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w:.-]+\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
 for(const token of xml.matchAll(tokens)){
  if(token[1]!==undefined){if(!ignored.length&&!fieldDepth&&paragraphDepth)nodes.push({start:token.index,end:token.index+token[0].length,attrs:token[1],text:xmlDecode(token[2])});continue;}
  const tag=token[0].match(/^<(\/?)([\w:.-]+)/);if(!tag)continue;
  const closing=!!tag[1],name=tag[2],empty=/\/\s*>$/.test(token[0]);
  if(ignored.length){if(closing)ignored.pop();else if(!empty)ignored.push(name);continue;}
  if(!closing&&(protectedTags.has(name)||name==='w:rPr'||name==='w:pPr')){if(protectedTags.has(name))flush();if(!empty)ignored.push(name);continue;}
  if(name==='w:fldChar'){flush();if(!closing){const type=token[0].match(/\bw:fldCharType\s*=\s*(["'])(.*?)\1/)?.[2];if(type==='begin')fieldDepth++;else if(type==='end')fieldDepth=Math.max(0,fieldDepth-1);}continue;}
  if(name==='w:p'){flush();if(closing)paragraphDepth=Math.max(0,paragraphDepth-1);else if(!empty)paragraphDepth++;continue;}
  if(name!=='w:r'&&!(name==='w:t'&&empty))flush(); // Links, explicit breaks and other semantic ranges stay separate.
 }
 flush();return spans;
}
async function docx(host,signal){
 if(host.pages.length!==host.document.pageCount)fail('PAGE_MAPPING','Word 可编辑翻译暂不支持按预览页映射正文；请选择全部页面');
 const input=/\.doc$/i.test(host.document.relativePath)?await host.convertSource('docx'):await host.readSource(),files=host.zip.decode(input),blocks=[],documents=[];let number=0;
 for(const [name,data]of Object.entries(files)){
  if(!/^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(name))continue;
  const xml=decoder.decode(data),spans=docxSpans(xml);for(const span of spans){span.id='docx-'+number++;blocks.push({id:span.id,text:span.text});}documents.push({name,xml,spans});
 }
 if(!blocks.length)fail('NO_TEXT','Word 文档没有可翻译的正文文字');
 const values=await translateBlocks(host,blocks,signal);
 for(const document of documents){
  let xml=document.xml;for(const span of document.spans.toReversed())for(let index=span.nodes.length-1;index>=0;index--){const node=span.nodes[index],text=index===0?values.get(span.id):'';let attrs=node.attrs;if(/^\s|\s$/.test(text))attrs=/\bxml:space\s*=/.test(attrs)?attrs.replace(/\bxml:space\s*=\s*(["'])[^"']*\1/,'xml:space="preserve"'):attrs+' xml:space="preserve"';xml=xml.slice(0,node.start)+'<w:t'+attrs+'>'+xmlEncode(text)+'</w:t>'+xml.slice(node.end);}
  files[document.name]=encoder.encode(xml);
 }
 return{name:baseName(host)+'.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',extension:'.docx',bytes:host.zip.encode(files),previewText:blocks.map(block=>values.get(block.id)).join('\n'),warnings:['同一段连续文字合并翻译并写入首个文字节点，保留后续可编辑空节点；段内加粗、颜色等格式范围可能不再与译文逐词对应。','保留 DOCX 图片、表格、字段和原生公式 XML；文字长度变化可能改变分页，请检查保存副本的排版。']};
}
function formulaLike(text){return /(?:[=∑∫√≠≤≥±∞]|\\(?:frac|sum|int|begin)|[α-ωΑ-Ω])/.test(text)&&!/[A-Za-z]{4,}/.test(text);}
async function paged(host,signal){const pages=await host.readPdfPages(),blocks=[];for(const page of pages){if(!page.blocks.some(block=>block.text.trim()))fail('NO_TEXT','第 '+page.page+' 页没有可用文本层，未执行 OCR');for(const block of page.blocks)if(!formulaLike(block.text))blocks.push({id:block.id,text:block.text});}const values=await translateBlocks(host,blocks,signal),parts=[],warnings=['输出采用原页与译文页对照：原页保留全部公式和图像；译文按真实文本层块顺序排版，不承诺原位替换。'],preview=[];for(const page of pages){signal.throwIfAborted();const translated=page.blocks.map(block=>({id:block.id,text:values.get(block.id)??block.text,rect:block.rect})),renderBlocks=[{kind:'heading',level:1,text:'第 '+page.page+' 页 · '+host.targetLanguage+'译文（前页为原文）'},...translated.map(block=>({kind:'paragraph',text:block.text}))];const translation=await host.renderPdf(renderBlocks);parts.push({page:page.page,translation});preview.push('第 '+page.page+' 页\n'+translated.map(block=>block.text).join('\n'));if(translated.reduce((sum,block)=>sum+block.text.length,0)>2200)warnings.push('第 '+page.page+' 页译文较长，已允许续页并完整保留文字，请检查对照分页。');}return{name:baseName(host)+'.pdf',mime:'application/pdf',extension:'.pdf',bytes:await host.combinePdf(parts),previewText:preview.join('\n\n'),warnings};}
export async function translateDocument(host,signal){signal.throwIfAborted();if(/\.(md|markdown|txt)$/i.test(host.document.relativePath))return markdown(host,signal,decoder.decode(await host.readSource()));if(/\.docx?$/i.test(host.document.relativePath))return docx(host,signal);if(/\.(pdf|pptx?)$/i.test(host.document.relativePath))return paged(host,signal);fail('FORMAT','此翻译插件不支持该文档格式');}
