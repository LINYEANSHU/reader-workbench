import {posix} from 'node:path';
import {parseOrderedXml,tagOf,childrenOf,attribute,child,textContent,ommlToLatex,type XmlNode} from './omml.js';
import {readOfficeParts} from './office-math.js';
// Slides read straight from the .pptx: text in slide order with placeholder roles, tables, chart data from the chart
// parts, SmartArt text and formulas as LaTeX. Rendered slides lose chart numbers and table structure, and their text
// order follows drawing order.
export interface SlideContent {slide:number;hidden:boolean;markdown:string;pictureCoverage:number;diagramShapes:number;smartArt:boolean;charts:number;textSufficient:boolean}
/** A slide is read as text only when nothing on it needs to be seen: small pictures at most, no SmartArt, few drawn shapes. */
export const TEXT_SLIDE_LIMITS=Object.freeze({maxPictureCoverage:0.1,maxDiagramShapes:2});
const MAX_TABLE_ROWS=200,MAX_CHART_ROWS=200;
function descendants(node:XmlNode,tag:string,output:XmlNode[]=[]):XmlNode[]{for(const item of childrenOf(node)){if(tagOf(item)===tag)output.push(item);descendants(item,tag,output);}return output;}
const first=(node:XmlNode|undefined,tag:string)=>node?descendants(node,tag)[0]:undefined;
const path=(node:XmlNode|undefined,...tags:string[])=>tags.reduce<XmlNode|undefined>((current,tag)=>current&&child(current,tag),node);
const cell=(text:string)=>text.replace(/\|/g,'\\|').replace(/\s+/g,' ').trim();
function relationships(xml:string|undefined,part:string):Map<string,{target:string;type:string}>{
 const map=new Map<string,{target:string;type:string}>();if(!xml)return map;
 for(const item of descendants({root:parseOrderedXml(xml)},'Relationship')){const id=attribute(item,'Id'),target=attribute(item,'Target');if(!id||!target||attribute(item,'TargetMode')==='External')continue;
  map.set(id,{target:target.startsWith('/')?posix.normalize(target.slice(1)):posix.normalize(posix.join(posix.dirname(part),target)),type:attribute(item,'Type')??''});}
 return map;
}
const relsPath=(part:string)=>posix.join(posix.dirname(part),'_rels',posix.basename(part)+'.rels');
/** Text of one a:p, with formulas as $…$ and line breaks kept; mc:Fallback renderings are skipped. */
function paragraphText(paragraph:XmlNode):string{
 const visit=(node:XmlNode):string=>{const tag=tagOf(node);
  if(tag==='a:t')return textContent(node);if(tag==='a:br')return '\n';if(tag==='mc:Fallback'||tag?.endsWith('Pr'))return '';
  if(tag==='m:oMathPara'||tag==='m:oMath'){const latex=ommlToLatex(node).trim();return latex?(tag==='m:oMathPara'?'$$'+latex+'$$':'$'+latex+'$'):'';}
  return childrenOf(node).map(visit).join('');};
 return childrenOf(paragraph).map(visit).join('').trim();
}
function tableMarkdown(table:XmlNode):string{
 const rows=descendants(table,'a:tr').slice(0,MAX_TABLE_ROWS).map(row=>childrenOf(row).filter(item=>tagOf(item)==='a:tc').map(tableCell=>cell(descendants(tableCell,'a:p').map(paragraphText).join(' '))));
 if(!rows.length)return '';const width=Math.max(...rows.map(row=>row.length)),line=(row:string[])=>'| '+Array.from({length:width},(_,index)=>row[index]??'').join(' | ')+' |';
 return [line(rows[0]!),'| '+Array(width).fill('---').join(' | ')+' |',...rows.slice(1).map(line)].join('\n');
}
const chartKinds:Record<string,string>={barChart:'柱形/条形图',bar3DChart:'柱形/条形图',lineChart:'折线图',line3DChart:'折线图',pieChart:'饼图',pie3DChart:'饼图',ofPieChart:'饼图',doughnutChart:'环形图',areaChart:'面积图',area3DChart:'面积图',scatterChart:'散点图',bubbleChart:'气泡图',radarChart:'雷达图',stockChart:'股价图',surfaceChart:'曲面图',surface3DChart:'曲面图'};
function points(node:XmlNode|undefined):string[]{const values:string[]=[];if(!node)return values;for(const point of descendants(node,'c:pt')){const index=Number(attribute(point,'idx'));if(Number.isInteger(index)&&index>=0&&index<10000)values[index]=textContent(child(point,'c:v')??{});}return values;}
/** The cached series values of a chart part as a Markdown table. */
export function chartMarkdown(xml:string):string{
 const root={root:parseOrderedXml(xml)},title=first(path(first(root,'c:chart'),'c:title'),'c:tx'),heading=title?descendants(title,'a:t').map(textContent).join('').trim():'',plot=first(root,'c:plotArea');if(!plot)return '';
 const sections:string[]=[];
 for(const chart of childrenOf(plot)){const kind=(tagOf(chart)??'').replace(/^c:/,'');if(!chartKinds[kind])continue;
  const series=childrenOf(chart).filter(item=>tagOf(item)==='c:ser').map((item,index)=>({name:textContent(first(child(item,'c:tx'),'c:v')??{}).trim()||'系列'+(index+1),categories:points(child(item,'c:cat')??child(item,'c:xVal')),values:points(child(item,'c:val')??child(item,'c:yVal'))}));
  if(!series.length)continue;const categories=series.find(item=>item.categories.length)?.categories??[],count=Math.min(MAX_CHART_ROWS,Math.max(categories.length,...series.map(item=>item.values.length)));
  const rows=Array.from({length:count},(_,index)=>'| '+[cell(categories[index]??String(index+1)),...series.map(item=>cell(item.values[index]??''))].join(' | ')+' |');
  sections.push(['[图表'+(heading?'：'+heading:'')+'（'+chartKinds[kind]+'，数据取自文件内缓存）]','| 类别 | '+series.map(item=>cell(item.name)).join(' | ')+' |','| '+Array(series.length+1).fill('---').join(' | ')+' |',...rows].join('\n'));}
 return sections.join('\n\n');
}
function smartArtText(xml:string):string{return descendants({root:parseOrderedXml(xml)},'dgm:pt').filter(point=>!attribute(point,'type')||attribute(point,'type')==='node').map(point=>descendants(point,'a:p').map(paragraphText).filter(Boolean).join(' ')).filter(Boolean).map(text=>'- '+text).join('\n');}
const area=(node:XmlNode|undefined)=>{const extent=path(node,'a:xfrm','a:ext')??first(node,'a:ext');return extent?Number(attribute(extent,'cx'))*Number(attribute(extent,'cy'))||0:0;};
/** One slide part to Markdown plus the signals that say whether it must still be looked at. */
export function slideContent(xml:string,part:string,parts:Record<string,string>,slideArea:number,slide:number):SlideContent{
 const root={root:parseOrderedXml(xml)},links=relationships(parts[relsPath(part)],part),lines:string[]=[];let pictureArea=0,diagramShapes=0,smartArt=false,charts=0;
 const visit=(node:XmlNode)=>{const tag=tagOf(node);
  if(tag==='p:sp'){const placeholder=attribute(path(node,'p:nvSpPr','p:nvPr','p:ph')??{},'type'),title=placeholder==='title'||placeholder==='ctrTitle',body=placeholder==='body'||placeholder==='obj'||path(node,'p:nvSpPr','p:nvPr','p:ph')!==undefined&&!placeholder;
   const paragraphs=descendants(child(node,'p:txBody')??{},'a:p').map(paragraph=>{const properties=child(paragraph,'a:pPr')??{};return{text:paragraphText(paragraph),level:Number(attribute(properties,'lvl')??0)||0,bullet:!!(child(properties,'a:buChar')||child(properties,'a:buAutoNum'))};}).filter(item=>item.text);
   const geometry=attribute(path(node,'p:spPr','a:prstGeom')??{},'prst');if(!paragraphs.length&&(path(node,'p:spPr','a:custGeom')||geometry&&geometry!=='rect'))diagramShapes++;
   for(const paragraph of paragraphs)lines.push(title?'# '+paragraph.text.replace(/\n/g,' '):body||paragraph.level||paragraph.bullet?'  '.repeat(paragraph.level)+'- '+paragraph.text:paragraph.text);return;}
  if(tag==='p:pic'){pictureArea+=area(child(node,'p:spPr'));const description=attribute(path(node,'p:nvPicPr','p:cNvPr')??{},'descr')?.trim();lines.push(description?'[图片：'+description+']':'[图片]');return;}
  if(tag==='p:cxnSp'){diagramShapes++;return;}
  if(tag==='p:graphicFrame'){const data=first(node,'a:graphicData');const table=data&&child(data,'a:tbl');if(table){const markdown=tableMarkdown(table);if(markdown)lines.push(markdown);return;}
   const chart=data&&child(data,'c:chart'),target=chart&&links.get(attribute(chart,'r:id')??'')?.target;if(chart){charts++;const markdown=target&&parts[target]?chartMarkdown(parts[target]!):'';lines.push(markdown||'[图表：文件中没有可读取的数据缓存]');if(!markdown)diagramShapes+=TEXT_SLIDE_LIMITS.maxDiagramShapes+1;return;}
   const diagram=data&&child(data,'dgm:relIds'),dataPart=diagram&&links.get(attribute(diagram,'r:dm')??'')?.target;if(diagram){smartArt=true;const text=dataPart&&parts[dataPart]?smartArtText(parts[dataPart]!):'';if(text)lines.push('[SmartArt]\n'+text);return;}
   // Embedded objects (e.g. MathType equations) and media have no readable text here: the slide must be seen.
   lines.push('[嵌入对象]');diagramShapes+=TEXT_SLIDE_LIMITS.maxDiagramShapes+1;return;}
  if(tag==='mc:Fallback')return;
  for(const item of childrenOf(node))visit(item);};
 const tree=first(root,'p:spTree');if(tree)for(const item of childrenOf(tree))visit(item);
 const markdown=lines.join('\n').trim(),pictureCoverage=slideArea>0?Math.min(1,pictureArea/slideArea):0;
 return{slide,hidden:attribute(first(root,'p:sld')??childrenOf(root)[0]??{},'show')==='0',markdown,pictureCoverage,diagramShapes,smartArt,charts,
  textSufficient:!!markdown&&pictureCoverage<=TEXT_SLIDE_LIMITS.maxPictureCoverage&&diagramShapes<=TEXT_SLIDE_LIMITS.maxDiagramShapes&&!smartArt};
}
/** All slides of a .pptx in presentation order (hidden ones flagged), or [] when the package has no readable slide list. */
export async function extractSlides(file:string):Promise<SlideContent[]>{
 const parts=await readOfficeParts(file,name=>/^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|charts\/chart\d+\.xml|diagrams\/data\d+\.xml)$/.test(name));
 const presentation=parts['ppt/presentation.xml'];if(!presentation)return[];
 const root={root:parseOrderedXml(presentation)},size=first(root,'p:sldSz'),slideArea=size?Number(attribute(size,'cx'))*Number(attribute(size,'cy'))||0:0,links=relationships(parts['ppt/_rels/presentation.xml.rels'],'ppt/presentation.xml');
 return descendants(root,'p:sldId').flatMap((entry,index)=>{const target=links.get(attribute(entry,'r:id')??'')?.target;const xml=target&&parts[target];return xml?[slideContent(xml,target!,parts,slideArea,index+1)]:[];});
}
/** Rendered page of each slide: LibreOffice skips hidden slides when exporting, so visible slides are numbered in order. */
export function slidePages(slides:SlideContent[]):Map<number,number>{const pages=new Map<number,number>();let page=0;for(const slide of slides)if(!slide.hidden)pages.set(slide.slide,++page);return pages;}
