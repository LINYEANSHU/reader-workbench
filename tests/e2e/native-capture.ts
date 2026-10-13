import {expect,type Page,type TestInfo} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

// Observe the real browser APIs without supplying frames or extra video sinks.
export async function observeNativeCapture(page:Page){
 await page.evaluate(()=>{
  const state=window as any;state.nativeCaptureEvents=[];state.nativeGrantState='pending';
  const started=performance.now(),record=(stage:string,details:unknown={})=>state.nativeCaptureEvents.push({stage,ms:Math.round(performance.now()-started),details});
  const native=navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:async(options:DisplayMediaStreamOptions)=>{
   record('grant-enter',{title:document.title,visibility:document.visibilityState,focused:document.hasFocus()});
   try{const stream=await native(options);state.nativeTracks=stream.getTracks();state.nativeGrantState='granted';record('grant-return');return stream;}
   catch(error){state.nativeCaptureError=String(error);state.nativeGrantState='rejected';record('grant-rejected',String(error));throw error;}
  }});
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){record('play-enter');return play.call(this).then(()=>{record('play-return');},error=>{record('play-rejected',String(error));throw error;});};
  const request=HTMLVideoElement.prototype.requestVideoFrameCallback,cancel=HTMLVideoElement.prototype.cancelVideoFrameCallback;
  if(request){
   HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){record('frame-request');return request.call(this,(now,metadata)=>{record('frame-return',{width:metadata.width,height:metadata.height});callback(now,metadata);});};
   HTMLVideoElement.prototype.cancelVideoFrameCallback=function(id){record('frame-cancel');cancel.call(this,id);};
  }
 });
}

export async function waitNativeCapture(page:Page,phase:'grant'|'frame',timeout:number){
 // A capture error must fail immediately, instead of waiting out a larger budget.
 const result=await page.waitForFunction(phase=>{
  const state=window as any,error=state.nativeCaptureError||document.querySelector<HTMLElement>('.capture-error')?.innerText;
  if(error)return{error};
  if(phase==='grant'?state.nativeGrantState==='granted':document.querySelector('[role="dialog"][aria-label="框选屏幕截图"]'))return{ready:true};
  return false;
 },phase,{timeout,polling:100});
 const state=await result.jsonValue();expect(state,`Native capture ${phase} failed`).toEqual({ready:true});
}

export async function saveNativeCaptureState(page:Page,testInfo:TestInfo){
 const state=await page.evaluate(()=>({events:(window as any).nativeCaptureEvents,grant:(window as any).nativeGrantState,error:(window as any).nativeCaptureError,tracks:(window as any).nativeTracks?.map((track:MediaStreamTrack)=>({kind:track.kind,state:track.readyState,settings:track.getSettings()})),title:document.title,visibility:document.visibilityState,focused:document.hasFocus(),captureError:document.querySelector<HTMLElement>('.capture-error')?.innerText}));
 await writeFile(testInfo.outputPath('native-capture-state.json'),JSON.stringify(state,null,2));
}
