import {readFile} from 'node:fs/promises';
import {loadImage} from '@napi-rs/canvas';
import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
import {ReaderError} from '../../../contracts/src/errors.js';
const MAX_IMAGE_DIM=16384,MAX_IMAGE_PIXELS=64_000_000;
function probeImageDimensions(bytes:Uint8Array):{width:number;height:number}|undefined{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length>=24&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return{width:view.getUint32(16,false),height:view.getUint32(20,false)};
  if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8){
    for(let offset=2;offset+9<bytes.length;){
      if(bytes[offset]!==0xff){offset++;continue;}
      const marker=bytes[offset+1]!;if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7)){offset+=2;continue;}
      const size=view.getUint16(offset+2,false);if(size<2||offset+2+size>bytes.length)break;
      if((marker>=0xc0&&marker<=0xc3)||(marker>=0xc5&&marker<=0xc7)||(marker>=0xc9&&marker<=0xcb)||(marker>=0xcd&&marker<=0xcf))return{height:view.getUint16(offset+5,false),width:view.getUint16(offset+7,false)};
      offset+=2+size;
    }
  }
  if(bytes.length>=30&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50){
    const chunk=String.fromCharCode(bytes[12]!,bytes[13]!,bytes[14]!,bytes[15]!);
    if(chunk==='VP8X')return{width:1+(bytes[24]!|(bytes[25]!<<8)|(bytes[26]!<<16)),height:1+(bytes[27]!|(bytes[28]!<<8)|(bytes[29]!<<16))};
    if(chunk==='VP8 '&&bytes.length>=30)return{width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff};
    if(chunk==='VP8L'&&bytes.length>=25){const bits=view.getUint32(21,true);return{width:(bits&0x3fff)+1,height:((bits>>14)&0x3fff)+1};}
  }
  return undefined;
}
export function assertSafeImageDimensions(bytes:Uint8Array):void{
  const size=probeImageDimensions(bytes);
  if(size&&(!size.width||!size.height||size.width>MAX_IMAGE_DIM||size.height>MAX_IMAGE_DIM||size.width*size.height>MAX_IMAGE_PIXELS))throw new ReaderError('IMAGE_TOO_LARGE','图像像素尺寸超过安全上限（单边不超过 16384 且总像素不超过 6400 万）',413);
}
export const imageAdapter:DocumentAdapter={supports:mime=>['image/png','image/jpeg','image/webp'].includes(mime),parse:async(input,signal)=>{
  signal.throwIfAborted();const bytes=await readFile(input.path,{signal});assertSafeImageDimensions(bytes);
  const image=await loadImage(bytes);signal.throwIfAborted();
  return {pages:[{page:1,text:'',width:image.width,height:image.height,imagePath:input.path,anchors:[{workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'page',page:1}}]}],blocks:[],warnings:['图像原件可阅读；文字识别需要已配置的视觉模型或 OCR 工具。']};
}};
