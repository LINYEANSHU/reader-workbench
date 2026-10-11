import {loadImage} from '@napi-rs/canvas';
import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
export const imageAdapter:DocumentAdapter={supports:mime=>['image/png','image/jpeg','image/webp'].includes(mime),parse:async(input,signal)=>{
  signal.throwIfAborted();const image=await loadImage(input.path);signal.throwIfAborted();
  return {pages:[{page:1,text:'',width:image.width,height:image.height,imagePath:input.path,anchors:[{workspaceId:input.workspaceId,documentId:input.documentId,version:input.version,location:{kind:'page',page:1}}]}],blocks:[],warnings:['图像原件可阅读；文字识别需要已配置的视觉模型或 OCR 工具。']};
}};
