import type {CaptureResult,ViewportRect} from '../../../../packages/contracts/src/documents.js';
import {captureCanvas,png,waitFor} from './coordinates.js';

class ScreenFrameTimeout extends Error{constructor(){super('屏幕视频未提供新画面，请重试');}}
async function freshFrame(video:HTMLVideoElement,signal:AbortSignal,timeout=15000):Promise<void>{
 if(!video.requestVideoFrameCallback){await video.play();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));signal.throwIfAborted();return;}
 await new Promise<void>((resolve,reject)=>{
  let callback=0,remaining=1,finished=false;
  const finish=(error?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);video.cancelVideoFrameCallback(callback);signal.removeEventListener('abort',abort);error?reject(error):resolve();};
  const abort=()=>finish(signal.reason??new DOMException('Capture cancelled','AbortError'));
  const timer=setTimeout(()=>finish(new ScreenFrameTimeout()),timeout);
  const next=()=>{if(--remaining===0)finish();else callback=video.requestVideoFrameCallback(next);};
  signal.addEventListener('abort',abort,{once:true});callback=video.requestVideoFrameCallback(next);void video.play().catch(finish);if(signal.aborted)abort();
 });
}
async function recoverFrame(video:HTMLVideoElement,stream:MediaStream,signal:AbortSignal){
 try{await freshFrame(video,signal,2000);}
 catch(error){
  if(!(error instanceof ScreenFrameTimeout)||signal.aborted||!stream.getVideoTracks().some(track=>track.readyState==='live'))throw error;
  // A native Windows sink can stall at startup. Reattaching the same stream
  // requests a fresh frame in Chromium; allow one recovery, then fail normally.
  video.pause();video.srcObject=null;video.srcObject=stream;await freshFrame(video,signal);
 }
}
export async function captureScreen(signal:AbortSignal):Promise<CaptureResult>{
 if(!window.isSecureContext||!navigator.mediaDevices?.getDisplayMedia)throw new Error('浏览器不支持屏幕捕获，请在 localhost 或 HTTPS 使用此功能');
 let stream:MediaStream|undefined;const video=document.createElement('video');video.muted=true;
 const hidden:Array<{node:HTMLElement;visibility:string}>=[];
 const stop=()=>stream?.getTracks().forEach(track=>track.stop());signal.addEventListener('abort',stop,{once:true});
 try{
  const options:DisplayMediaStreamOptions&{selfBrowserSurface:'include'}={video:true,audio:false,selfBrowserSurface:'include'};
  stream=await navigator.mediaDevices.getDisplayMedia(options);signal.throwIfAborted();
  // Drain the initial frame before changing this tab; a static native stream may
  // queue that frame while the permission overlay is still visible.
  if(stream.getVideoTracks()[0]?.getSettings().displaySurface==='browser'){video.srcObject=stream;await recoverFrame(video,stream,signal);}
  // Let React commit the waiting controls before hiding them for this tab's frame.
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));signal.throwIfAborted();
  // Hide only our capture controls, so selecting this tab preserves its actual document pixels.
  for(const node of document.querySelectorAll<HTMLElement>('[data-capture-pending]')){hidden.push({node,visibility:node.style.visibility});node.style.visibility='hidden';}
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));signal.throwIfAborted();
  // Reconnect the video sink after hiding the controls. Native tab capture
  // requests a refresh for a new sink, even when the tab is otherwise static.
  // This also discards a queued frame containing the permission overlay.
  video.pause();video.srcObject=null;video.srcObject=stream;await recoverFrame(video,stream,signal);await waitFor(()=>video.videoWidth>0&&video.videoHeight>0&&video.readyState>=2,signal);
  const canvas=captureCanvas({x:0,y:0,width:video.videoWidth,height:video.videoHeight},1);canvas.getContext('2d')!.drawImage(video,0,0);
  return{blob:await png(canvas,signal),width:canvas.width,height:canvas.height,anchors:[]};
 }finally{stop();video.pause();video.srcObject=null;for(const entry of hidden)entry.node.style.visibility=entry.visibility;signal.removeEventListener('abort',stop);}
}
export async function cropFrame(frame:CaptureResult,display:DOMRect,rect:ViewportRect,signal:AbortSignal):Promise<CaptureResult>{const bitmap=await createImageBitmap(frame.blob);try{const ratio=frame.width/display.width,target=captureCanvas(rect,ratio);target.getContext('2d')!.drawImage(bitmap,(rect.x-display.left)*ratio,(rect.y-display.top)*ratio,rect.width*ratio,rect.height*ratio,0,0,target.width,target.height);return{blob:await png(target,signal),width:target.width,height:target.height,anchors:[]};}finally{bitmap.close();}}



