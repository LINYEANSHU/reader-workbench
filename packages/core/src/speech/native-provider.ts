import {fork,type ChildProcess} from 'node:child_process';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {getDefaultEnvironment} from '@modelcontextprotocol/client/stdio';import type {SpeechProvider} from '../../../sdk/src/capabilities.js';import type {SpeechAudio,SpeechProgress,SpeechResult} from '../../../contracts/src/speech.js';import {ReaderError} from '../../../contracts/src/errors.js';import {SpeechAssets} from './assets.js';import {stopProcessTree} from '../runtime/process.js';
export class NativeSpeechProvider implements SpeechProvider{
 readonly processingLocation='local' as const;readonly languages=['auto','zh','en','ja','ko','yue'];private child?:ChildProcess;private language?:string;private stage='idle';private disposed=false;
 constructor(readonly assets:SpeechAssets,private workerPath=fileURLToPath(new URL('./worker.mjs',import.meta.url))){}
 private environment(){const platform=process.platform==='win32'?'win':process.platform,pkg='sherpa-onnx-'+platform+'-'+process.arch;let directory:string;try{directory=dirname(createRequire(import.meta.url).resolve(pkg));}catch{throw new ReaderError('SPEECH_RUNTIME_UNAVAILABLE','此平台缺少内置语音运行库，请重新安装完整应用',503);}return{...getDefaultEnvironment(),...(process.platform==='darwin'?{DYLD_LIBRARY_PATH:directory}:process.platform==='linux'?{LD_LIBRARY_PATH:directory}:{})};}
 async prepare(signal:AbortSignal,onProgress:(progress:SpeechProgress)=>void){if(this.disposed)throw new ReaderError('SPEECH_DISPOSED','语音引擎已关闭',503);this.environment();await this.assets.prepare(signal,onProgress);}
 private async stop(child:ChildProcess){if(this.child===child){this.child=undefined;this.language=undefined;}await stopProcessTree(child);}
 private async call(child:ChildProcess,message:Record<string,unknown>,signal:AbortSignal):Promise<Record<string,unknown>>{
  signal.throwIfAborted();const id=randomUUID();return new Promise((resolve,reject)=>{
   let settled=false;const cleanup=()=>{signal.removeEventListener('abort',abort);child.removeListener('message',receive);child.removeListener('close',close);};
   const finish=(error?:Error,result?:Record<string,unknown>)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(result!);};
   const abort=()=>{if(settled)return;settled=true;cleanup();void this.stop(child).then(()=>reject(new ReaderError('CANCELLED','语音识别已取消')),reject);};
   const receive=(raw:unknown)=>{const response=raw as Record<string,unknown>;if(response?.id!==id)return;if(response.stage==='decoding'){this.stage='decoding';return;}this.stage='idle';if(response.error)finish(new ReaderError('SPEECH_ENGINE_FAILED','本地语音识别失败，请重试'));else finish(undefined,response);};
   const close=()=>finish(new ReaderError('SPEECH_ENGINE_EXITED','本地语音识别进程已退出，请重试',503));signal.addEventListener('abort',abort,{once:true});child.on('message',receive);child.once('close',close);child.send({id,...message},error=>{if(error)finish(new ReaderError('SPEECH_ENGINE_EXITED','本地语音识别连接已关闭',503));});if(signal.aborted)abort();
  });
 }
 async transcribe(audio:SpeechAudio,language:string,signal:AbortSignal):Promise<SpeechResult>{
  if(this.disposed)throw new ReaderError('SPEECH_DISPOSED','语音引擎已关闭',503);if(!this.languages.includes(language))throw new ReaderError('SPEECH_LANGUAGE_INVALID','语音语言无效');signal.throwIfAborted();let energy=0;for(const sample of audio.samples)energy+=sample*sample;if(Math.sqrt(energy/audio.samples.length)<.001)return{text:'',audioSeconds:audio.seconds,inferenceSeconds:0};
  if(this.child&&(this.language!==language||this.child.exitCode!==null))await this.stop(this.child);
  if(!this.child){const paths=await this.assets.paths(signal),child=fork(this.workerPath,[],{execPath:process.execPath,execArgv:[],stdio:['ignore','ignore','pipe','ipc'],serialization:'advanced',windowsHide:true,detached:process.platform!=='win32',env:this.environment()});this.child=child;this.language=language;child.stderr?.on('data',()=>{});child.once('error',()=>{});child.once('close',()=>{if(this.child===child){this.child=undefined;this.language=undefined;}});try{await this.call(child,{kind:'init',...paths,language},signal);}catch(error){await this.stop(child);throw error;}}
  const result=await this.call(this.child,{kind:'transcribe',samples:audio.samples},signal);return{text:String(result.text??''),audioSeconds:audio.seconds,inferenceSeconds:Number(result.inferenceSeconds)};
 }
 debug(){return{pid:this.child?.pid??null,language:this.language??null,stage:this.stage};}
 async dispose(){this.disposed=true;if(this.child)await this.stop(this.child);}
}
