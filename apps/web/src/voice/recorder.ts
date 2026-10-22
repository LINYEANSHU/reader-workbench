import {t} from '../i18n/index.js';
import {encodePcm16Wave,resampleMono} from '../../../../packages/core/src/speech/wave.js';

let microphoneOwner:MicRecorder|undefined;
export class MicRecorder {
 private stream?:MediaStream;private context?:AudioContext;private source?:MediaStreamAudioSourceNode;private node?:AudioWorkletNode;private gain?:GainNode;private chunks:Float32Array[]=[];private frames=0;private cancelled=false;private flushed?:()=>void;private rate=48000;
 constructor(private update:(seconds:number,level:number)=>void,private onLimit:()=>void,private onLost:()=>void){}
 async start(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error(t("当前浏览器无法使用麦克风，请通过本机地址打开应用", "Microphone access is unavailable. Open the app using a local address."));
  if(microphoneOwner)throw new Error(t("另一个对话栏正在使用麦克风，请先停止该录音", "Another chat pane is using the microphone. Stop that recording first."));microphoneOwner=this;
  try{
   let stream:MediaStream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});}catch{throw new Error(t("无法使用麦克风：请允许浏览器访问麦克风，并检查设备连接；也可尝试支持录音的另一款浏览器", "Microphone access failed. Allow access in your browser and check the device connection, or try another browser that supports recording."));}
   if(this.cancelled){stream.getTracks().forEach(track=>track.stop());throw new DOMException('Cancelled','AbortError');}this.stream=stream;
   stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(!this.cancelled)this.onLost();},{once:true}));
   const context=new AudioContext();this.context=context;this.rate=context.sampleRate;await context.audioWorklet.addModule('/voice/recorder-worklet.js');if(this.cancelled)throw new DOMException('Cancelled','AbortError');
   const source=context.createMediaStreamSource(stream),node=new AudioWorkletNode(context,'reader-recorder'),gain=context.createGain();this.source=source;this.node=node;this.gain=gain;gain.gain.value=0;
   node.port.onmessage=({data}:{data:{samples?:Float32Array;flushed?:boolean}})=>{if(data.flushed){this.flushed?.();return;}if(this.cancelled||!data.samples)return;const chunk=data.samples.subarray(0,Math.max(0,this.rate*120-this.frames)).slice();this.chunks.push(chunk);this.frames+=chunk.length;let energy=0;for(const sample of chunk)energy+=sample*sample;this.update(this.frames/this.rate,Math.min(1,Math.sqrt(energy/Math.max(1,chunk.length))*8));if(this.frames>=this.rate*120)this.onLimit();};
   source.connect(node);node.connect(gain);gain.connect(context.destination);await context.resume();if(this.cancelled)throw new DOMException('Cancelled','AbortError');
  }catch(error){await this.cancel();if(error instanceof DOMException&&['NotAllowedError','PermissionDeniedError','NotFoundError','NotReadableError'].includes(error.name))throw new Error(t("无法使用麦克风：请允许浏览器访问麦克风，并检查设备连接", "Microphone access failed. Allow access in your browser and check the device connection."));throw error;}
 }
 async finish(){
  this.stream?.getTracks().forEach(track=>track.stop());
  if(this.node)await new Promise<void>(resolve=>{const timeout=setTimeout(resolve,100);this.flushed=()=>{clearTimeout(timeout);resolve();};this.node!.port.postMessage('flush');});
  const input=new Float32Array(this.frames);let offset=0;for(const chunk of this.chunks){input.set(chunk,offset);offset+=chunk.length;}let result:Uint8Array;
  try{const samples=resampleMono(input,this.rate);try{result=encodePcm16Wave(samples,16000);}finally{samples.fill(0);}}finally{input.fill(0);await this.cancel();}return result;
 }
 async cancel(){this.cancelled=true;this.stream?.getTracks().forEach(track=>track.stop());this.source?.disconnect();this.node?.disconnect();this.gain?.disconnect();this.node?.port.close();if(this.context&&this.context.state!=='closed')await this.context.close().catch(()=>{});this.chunks.forEach(chunk=>chunk.fill(0));this.chunks=[];this.frames=0;if(microphoneOwner===this)microphoneOwner=undefined;}
}
