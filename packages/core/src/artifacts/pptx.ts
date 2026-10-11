import PptxModule from 'pptxgenjs';import {loadImage} from '@napi-rs/canvas';
const PptxGenJS=PptxModule as unknown as typeof import('pptxgenjs').default;
import type {ArtifactExporter} from '../../../sdk/src/capabilities.js';import type {ContentBlock} from '../../../contracts/src/artifacts.js';import {formulaImage} from './formula.js';
export const pptxExporter:ArtifactExporter={formats:['pptx'],export:async(input,_scope,signal)=>{
 const deck=new PptxGenJS();deck.layout='LAYOUT_WIDE';deck.author='Reader Workbench';deck.subject=input.name;const warnings:string[]=[];const heading=input.blocks.find(block=>block.kind==='heading')?.text??input.name;
 const textSlide=(text:string,title:string)=>{const characters=Array.from(text);for(let index=0;index<Math.max(1,characters.length);index+=600){const slide=deck.addSlide();slide.addText(title,{x:.6,y:.4,w:12,h:.65,fontSize:25,fontFace:'Noto Sans CJK SC',color:'17212B'});slide.addText(characters.slice(index,index+600).join(''),{x:.6,y:1.25,w:12,h:5.6,fontSize:18,fontFace:'Noto Sans CJK SC',breakLine:false,margin:0});}};
 for(const block of input.blocks){signal.throwIfAborted();
  if(block.kind==='image'||block.kind==='formula'){
   try{const image=block.kind==='image'?await loadImage(block.data):undefined;const rendered=block.kind==='formula'?await formulaImage(block.text,signal):{data:block.data,width:image!.width,height:image!.height},mime=block.kind==='formula'?'image/png':block.mime;const slide=deck.addSlide();slide.addText(block.kind==='formula'?'公式':block.alt,{x:.6,y:.4,w:12,h:.6,fontSize:25,fontFace:'Noto Sans CJK SC'});const scale=Math.min(11.8/rendered.width,5.3/rendered.height,block.kind==='formula'?2/96:Infinity),w=rendered.width*scale,h=rendered.height*scale;slide.addImage({data:mime+';base64,'+Buffer.from(rendered.data).toString('base64'),x:.7+(11.8-w)/2,y:1.15+(block.kind==='formula'?(5.3-h)/2:0),w,h});if(block.kind==='formula'){slide.addText('公式源表达式: '+block.text,{x:.6,y:6.7,w:12,h:.35,fontSize:12});slide.addNotes('公式源表达式: '+block.text);}continue;}
   catch(error){signal.throwIfAborted();if(block.kind==='image')throw error;warnings.push('公式无法渲染，已保留源表达式');textSlide(block.text,'公式源表达式');continue;}
  }
  if(block.kind==='table'){const columns=Math.max(1,...block.rows.map(row=>row.length));for(let index=0;index<block.rows.length;index+=12){const slide=deck.addSlide();slide.addText('表格'+(index?'（续）':''),{x:.6,y:.4,w:12,h:.6,fontSize:25});slide.addTable(block.rows.slice(index,index+12).map(row=>row.map(text=>({text}))),{x:.7,y:1.3,w:11.8,fontFace:'Noto Sans CJK SC',fontSize:16,border:{type:'solid',color:'A9B8C6',pt:1},colW:11.8/columns,rowH:.38,autoPage:true,autoPageRepeatHeader:true});}continue;}
  const text=block.kind==='list'?block.items.map(item=>'• '+item).join('\n'):block.text;const title=block.kind==='heading'?block.text:heading;textSlide(block.kind==='heading'?'':text,title);
 }
 if(!input.blocks.length)textSlide('','阅读件');const bytes=await deck.write({outputType:'nodebuffer'}) as Uint8Array;signal.throwIfAborted();return{bytes,mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',extension:'.pptx',warnings};
}};
