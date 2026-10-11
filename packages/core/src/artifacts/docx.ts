import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,ImageRun} from 'docx';import {loadImage} from '@napi-rs/canvas';
import type {ArtifactExporter} from '../../../sdk/src/capabilities.js';import {formulaImage} from './formula.js';
export const docxExporter:ArtifactExporter={formats:['docx'],export:async(input,_scope,signal)=>{
 const children:Array<Paragraph|Table>=[],warnings:string[]=[];
 for(const block of input.blocks){signal.throwIfAborted();
  if(block.kind==='table'){children.push(new Table({rows:block.rows.map(row=>new TableRow({children:row.map(cell=>new TableCell({children:[new Paragraph(cell)]}))}))}));continue;}
  if(block.kind==='list'){for(const item of block.items)children.push(new Paragraph({text:item,bullet:{level:0}}));continue;}
  if(block.kind==='formula'){
   try{const rendered=await formulaImage(block.text,signal);const scale=Math.min(1,580/rendered.width);children.push(new Paragraph({children:[new ImageRun({type:'png',data:rendered.data,transformation:{width:rendered.width*scale,height:rendered.height*scale}})]}));}
   catch(error){signal.throwIfAborted();warnings.push('公式渲染失败，保留原表达式: '+block.text.slice(0,120));}
   children.push(new Paragraph({children:[new TextRun({text:'公式源表达式: '+block.text,size:18,color:'566475'})]}));continue;
  }
  if(block.kind==='image'){
   const image=await loadImage(block.data),scale=Math.min(1,580/image.width,640/image.height);children.push(new Paragraph({children:[new ImageRun({type:block.mime==='image/jpeg'?'jpg':'png',data:block.data,transformation:{width:image.width*scale,height:image.height*scale},altText:{title:block.alt,description:block.alt,name:block.alt}})]}));continue;
  }
  children.push(new Paragraph({text:block.text,...(block.kind==='heading'?{heading:('Heading'+Math.max(1,Math.min(6,block.level))) as 'Heading1'}:{}),spacing:{after:160}}));
 }
 for(const warning of warnings)children.push(new Paragraph('格式提示: '+warning));
 const document=new Document({title:input.name,creator:'Reader Workbench',styles:{default:{document:{run:{font:'Noto Sans CJK SC',size:22}}}},sections:[{properties:{},children}]});
 const bytes=await Packer.toBuffer(document);signal.throwIfAborted();return{bytes,mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',extension:'.docx',warnings};
}};
