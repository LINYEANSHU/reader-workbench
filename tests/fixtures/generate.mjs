import {mkdir,writeFile,readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,ImageRun,Math as OfficeMath,MathRun} from 'docx';
import PptxGenJS from 'pptxgenjs';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const execute=promisify(execFile),root=resolve('tests/fixtures');
await mkdir(join(root,'assets'),{recursive:true});
if(process.platform==='win32')GlobalFonts.registerFromPath('C:/Windows/Fonts/msyh.ttc','Fixture Chinese');
const canvas=createCanvas(640,240),context=canvas.getContext('2d');
context.fillStyle='#123f62';context.fillRect(0,0,640,240);
context.fillStyle='#ffdd66';context.fillRect(30,30,96,96);
context.fillStyle='white';context.font='28px "Fixture Chinese", sans-serif';context.fillText('中文阅读 · RI / CSI',155,86);
context.fillText('CAPTURE_MARKER_2468',155,143);
const png=canvas.toBuffer('image/png');await writeFile(join(root,'assets/diagram.png'),png);
await writeFile(join(root,'reader.md'),'# 阅读测试 · RI\n\n这是中文阅读材料，RI 表示秩指示。选择这段文字可以向 AI 提问。\n\n| 参数 | 含义 |\n| --- | --- |\n| RI | 秩指示 |\n| CQI | 信道质量 |\n\n$$E = mc^2$$\n\n![示意图](assets/diagram.png)\n\n## Second block\n\nVersioned original marker.\n');
const document=new Document({sections:[{children:[
  new Paragraph({text:'中文文档阅读 · RI',heading:'Heading1'}),
  new Paragraph('RI means rank indicator. 中文原文，保留图片、表格和公式。'),
  new Paragraph({children:[new OfficeMath({children:[new MathRun('E = mc²')]})]}),
  new Table({rows:[new TableRow({children:[new TableCell({children:[new Paragraph('参数')]}),new TableCell({children:[new Paragraph('含义')]})]}),new TableRow({children:[new TableCell({children:[new Paragraph('RI')]}),new TableCell({children:[new Paragraph('秩指示')]})]})]}),
  new Paragraph({children:[new ImageRun({data:png,type:'png',transformation:{width:480,height:180}})]}),
  new Paragraph({children:[new TextRun({text:'Second page RI continuation',break:1})],pageBreakBefore:true}),
]}]});
await writeFile(join(root,'reader.docx'),await Packer.toBuffer(document));
const deck=new PptxGenJS();deck.layout='LAYOUT_WIDE';deck.author='Reader Workbench fixtures';deck.subject='Self-generated reading test';
for(let page=1;page<=2;page++){const slide=deck.addSlide();slide.addText('中文幻灯片 · RI · '+page,{x:0.7,y:0.4,w:11.4,h:0.6,fontFace:'Microsoft YaHei',fontSize:26});slide.addText('RI means rank indicator. E = mc²',{x:0.7,y:1.2,w:10,h:0.6,fontSize:20});slide.addTable([['参数','含义'],['RI','秩指示']],{x:0.7,y:2,w:4,h:1,fontSize:16,border:{type:'solid',color:'999999',pt:1}});slide.addImage({data:'image/png;base64,'+png.toString('base64'),x:5.3,y:2,w:6,h:2.25});slide.addNotes('第 '+page+' 页备注：RI_NOTE_'+page+' 不能混入其他页。');}
await deck.writeFile({fileName:join(root,'reader.pptx')});
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),image=await pdf.embedPng(png);
for(let i=1;i<=2;i++){const page=pdf.addPage([612,792]);page.drawText('Reading RI page '+i,{x:48,y:740,size:24,font});page.drawText('E = mc^2; RI is rank indicator.',{x:48,y:695,size:14,font});page.drawImage(image,{x:48,y:420,width:480,height:180});for(let row=0;row<3;row++){page.drawRectangle({x:48,y:320+row*24,width:240,height:24,borderWidth:1,borderColor:rgb(0.5,0.5,0.5)});page.drawText(['RI | Rank','CQI | Quality','Parameter | Meaning'][row],{x:55,y:328+row*24,size:10,font});}}
await writeFile(join(root,'reader.pdf'),await pdf.save());
const scan=await PDFDocument.create(),scanImage=await scan.embedPng(png);scan.addPage([640,240]).drawImage(scanImage,{x:0,y:0,width:640,height:240});await writeFile(join(root,'scan.pdf'),await scan.save());
await writeFile(join(root,'broken.pdf'),'%PDF-1.7\nThis is intentionally corrupt.');
await writeFile(join(root,'plain.txt'),'中文短词 秩 RI\n');await writeFile(join(root,'unknown.bin'),new Uint8Array([0,1,2,255]));
const office=process.env.READER_LIBREOFFICE;
let legacyEngine;
if(office){
  legacyEngine={name:'LibreOffice',version:(await execute(office,['--version'],{windowsHide:true,timeout:10000})).stdout.trim()};
  const temporary=await mkdtemp(join(tmpdir(),'reader-fixtures-'));
  const profile='-env:UserInstallation='+pathToFileURL(join(temporary,'profile')).href;
  try{
  for(const [input,filter]of [['reader.docx','doc:MS Word 97'],['reader.pptx','ppt:MS PowerPoint 97']]){
    await execute(office,[profile,'--headless','--convert-to',filter,'--outdir',root,join(root,input)],{windowsHide:true,timeout:120000});
  }
  await writeFile(join(temporary,'encrypted.docx'),await readFile(join(root,'reader.docx')));
  await execute(office,[profile,'--headless','--convert-to','pdf:writer_pdf_Export:{"EncryptFile":{"type":"boolean","value":"true"},"DocumentOpenPassword":{"type":"string","value":"fixture-secret"}}','--outdir',temporary,join(temporary,'encrypted.docx')],{windowsHide:true,timeout:120000});
  await writeFile(join(root,'encrypted.pdf'),await readFile(join(temporary,'encrypted.pdf')));
  }finally{await rm(temporary,{recursive:true,force:true});}
}
const files=await readdir(root);const hashes={};
for(const file of files.filter(name=>/\.(md|pdf|docx?|pptx?|txt|bin)$/.test(name)))hashes[file]=createHash('sha256').update(await readFile(join(root,file))).digest('hex');
hashes['assets/diagram.png']=createHash('sha256').update(png).digest('hex');
await writeFile(join(root,'manifest.json'),JSON.stringify({license:'CC0-1.0',source:'Self-generated by tests/fixtures/generate.mjs; no user documents',generator:{node:process.version,docx:'9.10.0',pptxgenjs:'4.0.1',pdfLib:'1.17.1'},legacyFormats:office?'Real LibreOffice binary export from OOXML':'not-generated',legacyEngine,hashes},null,2)+'\n');
console.log('Generated fixtures:',Object.keys(hashes).join(', '));
