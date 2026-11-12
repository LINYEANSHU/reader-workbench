import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {unzipSync,zipSync} from 'fflate';
import PptxModule from 'pptxgenjs';
import {extractSlides,slidePages,slideContent,chartMarkdown} from '../../packages/core/src/documents/slides.js';
import {pageReadingText} from '../../packages/core/src/documents/memory-consumer.js';
import type {DocumentBlock} from '../../packages/contracts/src/documents.js';
const PptxGenJS=PptxModule as unknown as typeof import('pptxgenjs').default;
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
async function deck(){
 const directory=await mkdtemp(join(tmpdir(),'slides-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';
 let slide=pptx.addSlide();slide.addText('信道容量概述',{x:0.5,y:0.3,w:10,h:0.8,fontSize:28});
 slide.addText([{text:'香农公式给出上限',options:{bullet:true}},{text:'带宽越大容量越大',options:{bullet:true,indentLevel:1}}],{x:0.5,y:1.3,w:10,h:1.5});
 slide.addTable([[{text:'参数'},{text:'含义'}],[{text:'B'},{text:'带宽 | Hz'}],[{text:'S/N'},{text:'信噪比'}]],{x:0.5,y:3,w:8});slide.addNotes('第一页备注');
 slide=pptx.addSlide();slide.addText('吞吐量对比',{x:0.5,y:0.3,w:10,h:0.8});slide.addChart(pptx.ChartType.bar,[{name:'吞吐量',labels:['方案A','方案B'],values:[12.5,30]},{name:'时延',labels:['方案A','方案B'],values:[8,3]}],{x:0.5,y:1.2,w:8,h:4,title:'实验结果',showTitle:true});slide.addNotes('第二页备注');
 slide=pptx.addSlide();(slide as unknown as {hidden:boolean}).hidden=true;slide.addText('隐藏页',{x:0.5,y:0.5,w:5,h:1});slide.addNotes('隐藏页备注');
 slide=pptx.addSlide();slide.addText('系统框图',{x:0.5,y:0.3,w:10,h:0.8});slide.addImage({data:'image/png;base64,'+(await readFile('tests/fixtures/assets/diagram.png')).toString('base64'),x:0.5,y:1.2,w:12,h:6,altText:'系统框图截图'});slide.addNotes('第四页备注');
 const path=join(directory,'deck.pptx');await writeFile(path,await pptx.write({outputType:'nodebuffer'}) as Buffer);return path;
}
it('reads slide text, tables and chart data from the .pptx and keeps picture slides visual',async()=>{
 const slides=await extractSlides(await deck());
 expect(slides.map(slide=>[slide.slide,slide.hidden,slide.textSufficient])).toEqual([[1,false,true],[2,false,true],[3,true,true],[4,false,false]]);
 expect(slides[0]!.markdown).toBe('信道容量概述\n- 香农公式给出上限\n  - 带宽越大容量越大\n| 参数 | 含义 |\n| --- | --- |\n| B | 带宽 \\| Hz |\n| S/N | 信噪比 |');
 expect(slides[1]!.markdown).toContain('[图表：实验结果（柱形/条形图，数据取自文件内缓存）]\n| 类别 | 吞吐量 | 时延 |\n| --- | --- | --- |\n| 方案A | 12.5 | 8 |\n| 方案B | 30 | 3 |');
 expect(slides[3]!.markdown).toContain('[图片：系统框图截图]');expect(slides[3]!.pictureCoverage).toBeGreaterThan(0.5);
 expect([...slidePages(slides)]).toEqual([[1,1],[2,2],[4,3]]);
});
it('keeps slide formulas as LaTeX and treats embedded objects and drawn diagrams as visual',()=>{
 const math='<a:p><a:r><a:t>容量：</a:t></a:r><mc:AlternateContent><mc:Choice Requires="a14"><a14:m><m:oMathPara><m:oMath><m:r><m:t>C=B</m:t></m:r><m:func><m:fName><m:r><m:t>log</m:t></m:r></m:fName><m:e><m:r><m:t>(1+S/N)</m:t></m:r></m:e></m:func></m:oMath></m:oMathPara></a14:m></mc:Choice><mc:Fallback><a:r><a:t>C=Blog(1+S/N) fallback</a:t></a:r></mc:Fallback></mc:AlternateContent></a:p>';
 const shape=(body:string,geometry='rect')=>'<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:prstGeom prst="'+geometry+'"/></p:spPr>'+(body?'<p:txBody>'+body+'</p:txBody>':'')+'</p:sp>';
 const slide=(tree:string)=>'<p:sld><p:cSld><p:spTree>'+tree+'</p:spTree></p:cSld></p:sld>';
 const formula=slideContent(slide(shape(math)),'ppt/slides/slide1.xml',{},1,1);
 expect(formula.markdown).toBe('容量：$$C=B\\log {(1+S/N)}$$');expect(formula.textSufficient).toBe(true);
 expect(slideContent(slide(shape('<a:p><a:r><a:t>流程</a:t></a:r></a:p>')+shape('','rightArrow')+shape('','rightArrow')+'<p:cxnSp/>'),'ppt/slides/slide1.xml',{},1,1).textSufficient).toBe(false);
 const ole=slideContent(slide('<p:graphicFrame><a:graphic><a:graphicData uri="ole"><p:oleObj/></a:graphicData></a:graphic></p:graphicFrame>'+shape('<a:p><a:r><a:t>MathType 公式</a:t></a:r></a:p>')),'ppt/slides/slide1.xml',{},1,1);
 expect(ole.textSufficient).toBe(false);expect(ole.markdown).toContain('[嵌入对象]');
 expect(chartMarkdown('<c:chartSpace><c:chart><c:plotArea><c:pieChart><c:ser><c:tx><c:v>份额</c:v></c:tx><c:cat><c:strLit><c:pt idx="0"><c:v>甲</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:pt idx="0"><c:v>0.6</c:v></c:pt></c:numLit></c:val></c:ser></c:pieChart></c:plotArea></c:chart></c:chartSpace>')).toBe('[图表（饼图，数据取自文件内缓存）]\n| 类别 | 份额 |\n| --- | --- |\n| 甲 | 0.6 |');
});
it('pre-reads a slide from its own structure and notes instead of the rendered text',()=>{
 const anchor=(page:number)=>({workspaceId:'w',documentId:'d',version:'v',location:{kind:'page' as const,page}});
 const blocks=[{id:'slide-2',text:'# 结构化内容',kind:'slide',anchor:anchor(2)},{id:'note-2',text:'讲解要点',kind:'notes',anchor:anchor(2)},{id:'page-2',text:'渲染文字',anchor:anchor(2)}] as unknown as DocumentBlock[];
 expect(pageReadingText('渲染文字',blocks,2)).toBe('# 结构化内容\n\n[演讲者备注]\n讲解要点');expect(pageReadingText('渲染文字',blocks,1)).toBe('渲染文字');
});
it('skips slides whose parts are missing instead of failing the document',async()=>{
 const path=await deck(),files=unzipSync(await readFile(path));delete files['ppt/slides/slide2.xml'];
 const broken=join(path,'..','broken.pptx');await writeFile(broken,zipSync(files));
 // The rendered deck still has the missing slide, so page mapping is refused by the visible-count check.
 const slides=await extractSlides(broken);expect(slides.map(slide=>slide.slide)).toEqual([1,3,4]);expect(slidePages(slides).size).toBe(2);
});
