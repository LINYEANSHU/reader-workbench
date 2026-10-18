import {access,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import type {ModelProvider} from '../../../sdk/src/capabilities.js';
import type {ModelRequest} from '../../../contracts/src/models.js';
export const LOCAL_TRANSLATION_PROVIDER_ID='core.local-translation';
const INPUT_LIMIT=1024*1024,OUTPUT_LIMIT=16*1024*1024;
export interface TranslationPayload {targetLanguage:'简体中文'|'English';blocks:Array<{id:string;text:string}>}
export interface LocalTranslationOptions {runtimeDirectory:string;workerPath:string}
function fail(message:string):never {throw Object.assign(new Error(message),{code:'TRANSLATION_LOCAL_ERROR'});}
export function parseTranslationRequest(request:ModelRequest):TranslationPayload {
 if(request.tools?.length||request.messages.length!==2||request.messages[0]?.role!=='system'||typeof request.messages[0].content!=='string'||!request.messages[0].content.startsWith('DOCUMENT_TRANSLATION_BLOCKS\n')||request.messages[1]?.role!=='user'||typeof request.messages[1].content!=='string')fail('本地翻译协议只接受 DOCUMENT_TRANSLATION_BLOCKS JSON 请求');
 const content=request.messages[1].content as string;if(Buffer.byteLength(content)>INPUT_LIMIT)fail('本地翻译请求超过安全大小');
 let value:TranslationPayload;try{value=JSON.parse(content);}catch{fail('本地翻译协议需要有效 JSON');}
 if(!value||!['简体中文','English'].includes(value.targetLanguage))fail('本地翻译仅支持 简体中文 与 English');
 if(!Array.isArray(value.blocks)||!value.blocks.length||value.blocks.length>4096)fail('本地翻译 blocks 数量无效');
 const ids=new Set<string>();for(const block of value.blocks){if(!block||typeof block.id!=='string'||!block.id||block.id.length>256||ids.has(block.id)||typeof block.text!=='string'||!block.text.trim()||Buffer.byteLength(block.text)>64*1024)fail('本地翻译块编号 ID、正文或大小无效');ids.add(block.id);}
 return {targetLanguage:value.targetLanguage,blocks:value.blocks.map(({id,text})=>({id,text}))};
}
export async function getLocalTranslationStatus(options:LocalTranslationOptions):Promise<{ready:boolean;error?:string}> {
 try{const manifest=JSON.parse(await readFile(path.join(options.runtimeDirectory,'ready.json'),'utf8'));if(manifest.schemaVersion!==1||manifest.engine!=='CTranslate2')throw new Error('Unsupported manifest');
 await Promise.all([options.workerPath,path.join(options.runtimeDirectory,'python',process.platform==='win32'?'python.exe':'bin/python3'),...['ctranslate2/__init__.py','sentencepiece/__init__.py','opencc/__init__.py','opencc/config/t2s.json','opencc/dictionary/TSPhrases.txt','opencc/dictionary/TSCharacters.txt'].map(file=>path.join(options.runtimeDirectory,'site-packages',file)),...['en_zh','zh_en'].flatMap(direction=>[path.join(options.runtimeDirectory,'models',direction,'model','model.bin'),path.join(options.runtimeDirectory,'models',direction,'sentencepiece.model')])].map(file=>access(file)));
 return{ready:true};}catch{return{ready:false,error:'本地翻译引擎尚未安装或文件不完整，请运行 scripts/setup-local-translation.ps1'};}
}
async function runWorker(payload:TranslationPayload,options:LocalTranslationOptions,signal:AbortSignal):Promise<string>{
 signal.throwIfAborted();const status=await getLocalTranslationStatus(options);signal.throwIfAborted();if(!status.ready)fail(status.error!);
 return await new Promise<string>((resolve,reject)=>{
  const child=spawn(path.join(options.runtimeDirectory,'python',process.platform==='win32'?'python.exe':'bin/python3'),['-I',path.resolve(options.workerPath),'--runtime',path.resolve(options.runtimeDirectory)],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
  const output:Buffer[]=[];let size=0,stderr='',settled=false;
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  const finish=(error?:Error,text?:string)=>{if(settled)return;settled=true;cleanup();if(error){child.kill();reject(error);}else resolve(text!);};
  const abort=()=>finish(new DOMException('Translation aborted','AbortError'));
  const timer=setTimeout(()=>finish(new Error('本地翻译处理超时，请缩小处理范围')),10*60*1000);timer.unref();
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  child.on('error',error=>finish(error));child.stdin.on('error',error=>finish(error));
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>OUTPUT_LIMIT)finish(new Error('本地翻译输出超过安全大小'));else output.push(chunk);});
  child.stderr.on('data',(chunk:Buffer)=>{stderr=(stderr+chunk.toString('utf8')).slice(-4096);});
  child.on('close',code=>{if(settled)return;if(code!==0){finish(new Error('本地翻译引擎失败：'+stderr.trim()));return;}
   try{const text=Buffer.concat(output).toString('utf8'),value=JSON.parse(text);if(!Array.isArray(value.translations)||value.translations.length!==payload.blocks.length)throw new Error('译文覆盖不完整');
    for(let i=0;i<payload.blocks.length;i++){const actual=value.translations[i],expected=payload.blocks[i];if(actual?.id!==expected.id||typeof actual.text!=='string'||!actual.text.trim())throw new Error('译文编号无效');if(JSON.stringify(actual.text.match(/__RW_KEEP_\d+__/g)??[])!==JSON.stringify(expected.text.match(/__RW_KEEP_\d+__/g)??[]))throw new Error('译文改变了保护标记');}
    finish(undefined,JSON.stringify(value));}catch(error){finish(new Error('本地翻译协议错误：'+(error as Error).message));}
  });
  if(!settled)child.stdin.end(JSON.stringify(payload));
 });
}
export function createLocalTranslationProvider(options:LocalTranslationOptions):ModelProvider {
 return{identity:LOCAL_TRANSLATION_PROVIDER_ID,capabilities:{vision:false,tools:false,contextWindow:1_000_000},contextWindowSource:'application',async resolveCapabilities(signal){signal.throwIfAborted();const status=await getLocalTranslationStatus(options);if(!status.ready)fail(status.error!);},async *generate(request,signal){try{signal.throwIfAborted();const payload=parseTranslationRequest(request),translations:Array<{id:string;text:string}>=[];let size=0;
  // Earlier workspace-installed processors batch by bytes only. Keep those
  // installations compatible while each private worker stays bounded to 512.
  for(let index=0;index<payload.blocks.length;index+=512){const text=await runWorker({...payload,blocks:payload.blocks.slice(index,index+512)},options,signal);size+=Buffer.byteLength(text);if(size>OUTPUT_LIMIT)fail('本地翻译输出超过安全大小');translations.push(...JSON.parse(text).translations);}
  signal.throwIfAborted();yield{kind:'delta',text:JSON.stringify({translations})};yield{kind:'done'};}catch(error){signal.throwIfAborted();fail((error as Error).message);}}};
}
