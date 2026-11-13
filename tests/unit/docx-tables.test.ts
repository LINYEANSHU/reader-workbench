import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {extractTables,docxTableBlocks,tableBlocks} from '../../packages/core/src/documents/docx-tables.js';
import {pageReadingText} from '../../packages/core/src/documents/memory-consumer.js';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
const paragraph=(text:string)=>'<w:p><w:r><w:t xml:space="preserve">'+text+'</w:t></w:r></w:p>';
const tableCell=(content:string,properties='')=>'<w:tc>'+(properties?'<w:tcPr>'+properties+'</w:tcPr>':'')+content+'</w:tc>';
const row=(...cells:string[])=>'<w:tr>'+cells.join('')+'</w:tr>';
const document=(body:string)=>'<w:document><w:body>'+body+'</w:body></w:document>';
const sample=document(paragraph('表 2 列出各方案的实验结果。')+'<w:tbl>'+row(tableCell(paragraph('方案')),tableCell(paragraph('吞吐量 | Mbps')),tableCell(paragraph('时延')))
 +row(tableCell(paragraph('方案A（基线配置）'),'<w:vMerge w:val="restart"/>'),tableCell(paragraph('12.5')),tableCell(paragraph('8 ms')))
 +row(tableCell(paragraph(''),'<w:vMerge/>'),tableCell(paragraph('合并后的说明'),'<w:gridSpan w:val="2"/>'))
 +row(tableCell(paragraph('方案B')),tableCell('<w:p><m:oMath><m:sSup><m:e><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>3</m:t></m:r></m:sup></m:sSup></m:oMath></w:p>'),tableCell(paragraph('3 ms')))+'</w:tbl>'+paragraph('表后正文。'));
it('reads rows, merged cells and cell formulas of a Word table as Markdown',()=>{
 expect(extractTables(sample)).toEqual([{markdown:['| 方案 | 吞吐量 \\| Mbps | 时延 |','| --- | --- | --- |','| 方案A（基线配置） | 12.5 | 8 ms |','|  | 合并后的说明 |  |','| 方案B | ${10}^{3}$ | 3 ms |'].join('\n'),context:'吞吐量 | Mbps',before:'表 2 列出各方案的实验结果。'}]);
});
it('places each table on the rendered page holding its cells and adds it to the text pre-reading reads',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'docx-tables-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'paper.docx');await writeFile(path,zipSync({'word/document.xml':strToU8(sample)}));
 // The intro paragraph ends page 1; the table itself starts page 2.
 const pages=[{page:1,text:'前言 表 2 列出各方案的实验结果。'},{page:2,text:'方案 吞吐量 | Mbps 时延 方案A（基线 配置） 12.5 8 ms'}];
 const {blocks,unmapped}=await docxTableBlocks({path,workspaceId:'w',documentId:'d',version:'v'} as never,pages);
 expect(unmapped).toBe(0);expect(blocks.map(block=>[block.id,block.kind,block.anchor.location])).toEqual([['table-1','table',{kind:'page',page:2}]]);
 const reading=pageReadingText(pages[1]!.text,blocks,2);expect(reading).toContain('[本页表格（取自 Word 原文件');expect(reading).toContain('| 方案B | ${10}^{3}$ | 3 ms |');expect(pageReadingText('x',blocks,1)).toBe('x');
});
it('leaves tables unlocated when only a preceding paragraph or repeated header matches',()=>{
 const input={workspaceId:'w',documentId:'d',version:'v'} as never;
 const xml=document(paragraph('The preceding page introduction.')+'<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:tbl>'+row(tableCell(paragraph('A')),tableCell(paragraph('1')))+'</w:tbl>');
 expect(tableBlocks(xml,input,[{page:1,text:'The preceding page introduction.'},{page:2,text:'A 1'}])).toEqual({blocks:[],unmapped:1});
 expect(tableBlocks(sample,input,[{page:1,text:'吞吐量 | Mbps'},{page:2,text:'吞吐量 | Mbps'}])).toEqual({blocks:[],unmapped:1});
});
