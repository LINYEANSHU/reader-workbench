import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {ommlToLatex,parseOrderedXml,extractFormulas} from '../../packages/core/src/documents/omml.js';
import {locateFormulas,docxFormulaBlocks} from '../../packages/core/src/documents/office-math.js';
import {pageReadingText} from '../../packages/core/src/documents/memory-consumer.js';
import {formulaImage} from '../../packages/core/src/artifacts/formula.js';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
const run=(text:string)=>'<m:r><m:t>'+text+'</m:t></m:r>';
const latex=(xml:string)=>ommlToLatex(parseOrderedXml('<m:oMath>'+xml+'</m:oMath>')[0]!);
const cases:Array<[string,string,string]>=[
 ['quadratic formula',run('x=')+'<m:f><m:num>'+run('-b±')+'<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:sSup><m:e>'+run('b')+'</m:e><m:sup>'+run('2')+'</m:sup></m:sSup>'+run('-4ac')+'</m:e></m:rad></m:num><m:den>'+run('2a')+'</m:den></m:f>','x=\\frac{-b\\pm \\sqrt{{b}^{2}-4ac}}{2a}'],
 ['sum with limits',  '<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>'+run('i=1')+'</m:sub><m:sup>'+run('n')+'</m:sup><m:e><m:sSub><m:e>'+run('x')+'</m:e><m:sub>'+run('i')+'</m:sub></m:sSub></m:e></m:nary>','\\sum_{i=1}^{n} {{x}_{i}}'],
 ['default integral without limits','<m:nary><m:naryPr><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/><m:e>'+run('f(x)dx')+'</m:e></m:nary>','\\int {f(x)dx}'],
 ['matrix in brackets','<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:m><m:mr><m:e>'+run('a')+'</m:e><m:e>'+run('b')+'</m:e></m:mr><m:mr><m:e>'+run('c')+'</m:e><m:e>'+run('d')+'</m:e></m:mr></m:m></m:e></m:d>','\\left[\\begin{matrix}a & b \\\\ c & d\\end{matrix}\\right]'],
 ['function and limit',run('f=')+'<m:func><m:fName><m:limLow><m:e>'+run('lim')+'</m:e><m:lim>'+run('x→0')+'</m:lim></m:limLow></m:fName><m:e><m:f><m:num><m:func><m:fName>'+run('sin')+'</m:fName><m:e>'+run('x')+'</m:e></m:func></m:num><m:den>'+run('x')+'</m:den></m:f></m:e></m:func>','f=\\lim_{x\\to 0} {\\frac{\\sin {x}}{x}}'],
 ['accent, bar and Greek','<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>'+run('v')+'</m:e></m:acc>'+run('=')+'<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>'+run('αβ')+'</m:e></m:bar>','\\vec{v}=\\overline{\\alpha \\beta}'],
 ['escaped text and entities',run('P&lt;5%')+'<m:r><m:rPr><m:nor/></m:rPr><m:t>if n odd</m:t></m:r>','P<5\\%\\text{if n odd}'],
 ['aligned equations','<m:eqArr><m:e>'+run('a=1')+'</m:e><m:e>'+run('b=2')+'</m:e></m:eqArr>','\\begin{aligned}a=1 \\\\ b=2\\end{aligned}'],
 ['delimiter with separator','<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/><m:sepChr m:val=","/></m:dPr><m:e>'+run('x')+'</m:e><m:e>'+run('y')+'</m:e></m:d>','\\left\\{x,y\\right.'],
];
for(const [name,xml,expected] of cases)it('converts '+name+' to LaTeX',()=>{expect(latex(xml)).toBe(expected);});
it('produces LaTeX that MathJax typesets without errors',async()=>{
 for(const [,xml] of cases)await expect(formulaImage(latex(xml),new AbortController().signal)).resolves.toBeDefined();
},60_000);
it('finds inline and display formulas with the paragraph text that locates them',()=>{
 const document='<w:document><w:body><w:p><w:r><w:t>Section 2 explains channel capacity.</w:t></w:r></w:p><w:p><m:oMathPara><m:oMath>'+run('C=B')+'<m:func><m:fName>'+run('log')+'</m:fName><m:e>'+run('(1+S/N)')+'</m:e></m:func></m:oMath></m:oMathPara></w:p><w:p><w:r><w:t xml:space="preserve">where </w:t></w:r><m:oMath>'+run('B')+'</m:oMath><w:r><w:t xml:space="preserve"> is the bandwidth in hertz.</w:t></w:r></w:p></w:body></w:document>';
 expect(extractFormulas(document)).toEqual([
  {latex:'C=B\\log {(1+S/N)}',display:true,context:'',before:'Section 2 explains channel capacity.'},
  {latex:'B',display:false,context:'where is the bandwidth in hertz.',before:'Section 2 explains channel capacity.'}]);
});
it('places formulas only when their complete own paragraph text identifies one rendered page',()=>{
 const pages=[{page:1,text:'Intro text about channels.'},{page:2,text:'Section 2 explains\nchannel capacity. C = B log ( 1 + S / N )'},{page:3,text:'Appendix repeats: Section 2 explains channel capacity.'}];
 const formula=(context:string,before='')=>({latex:'x',display:false,context,before});
 expect(locateFormulas([formula('','Section 2 explains channel capacity.'),formula('Appendix repeats: Section 2'),formula('Section 2 explains channel capacity.'),formula('nowhere to be found')],pages)).toEqual([0,3,0,0]);
});
it('does not attach a formula across an explicit page break to the preceding paragraph',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'docx-math-break-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const xml='<w:document><w:body><w:p><w:r><w:t>Energy relation introduction.</w:t><w:br w:type="page"/></w:r></w:p><w:p><m:oMath>'+run('E=mc2')+'</m:oMath></w:p></w:body></w:document>',path=join(directory,'paper.docx');
 await writeFile(path,zipSync({'word/document.xml':strToU8(xml)}));
 const pages=[{page:1,text:'Energy relation introduction.',width:1,height:1,anchors:[]},{page:2,text:'E = m c 2',width:1,height:1,anchors:[]}];
 const result=await docxFormulaBlocks({path,workspaceId:'w',documentId:'d',version:'v'} as never,pages);expect(result).toEqual({blocks:[],unmapped:1});
});
it('does not locate a cross-page paragraph from only its matching prefix or suffix',()=>{
 const context='A unique starting phrase ends here. A unique ending phrase begins here.';
 expect(locateFormulas([{context,before:''}],[{page:1,text:'A unique starting phrase ends here.'},{page:2,text:'A unique ending phrase begins here.'}])).toEqual([0]);
});
it('adds exact formula blocks from a .docx to the pages that pre-reading sends as text',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'docx-math-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const xml='<w:document><w:body><w:p><w:r><w:t>Energy relation on page two.</w:t></w:r><m:oMath>'+run('E=m')+'<m:sSup><m:e>'+run('c')+'</m:e><m:sup>'+run('2')+'</m:sup></m:sSup></m:oMath></w:p></w:body></w:document>';
 const path=join(directory,'paper.docx');await writeFile(path,zipSync({'word/document.xml':strToU8(xml)}));
 const pages=[{page:1,text:'Title',width:1,height:1,anchors:[]},{page:2,text:'Energy relation on page two. E = m c 2',width:1,height:1,anchors:[]}];
 const {blocks,unmapped}=await docxFormulaBlocks({path,workspaceId:'w',documentId:'d',version:'v'} as never,pages);
 expect(unmapped).toBe(0);expect(blocks).toEqual([{id:'formula-1',text:'$E=m{c}^{2}$',kind:'formula',anchor:{workspaceId:'w',documentId:'d',version:'v',location:{kind:'page',page:2}}}]);
 expect(pageReadingText('Energy relation on page two. E = m c 2',blocks,2)).toContain('[本页公式');expect(pageReadingText('Title',blocks,1)).toBe('Title');
});
