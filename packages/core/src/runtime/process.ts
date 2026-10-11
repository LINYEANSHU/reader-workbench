import {spawn,type ChildProcess} from 'node:child_process';
import {ReaderError} from '../../../contracts/src/errors.js';
export interface ProcessResult {stdout:string;stderr:string;exitCode:number}
export async function stopProcessTree(child:ChildProcess):Promise<void>{
 if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));
 if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise<void>(resolve=>{killer.once('error',()=>{child.kill();resolve();});killer.once('exit',code=>{if(code!==0)child.kill();resolve();});});}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}await closed;
}
export async function runProcess(command:string,args:string[],signal:AbortSignal,timeoutMs:number,input?:string,environment?:NodeJS.ProcessEnv):Promise<ProcessResult>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe'],...(environment?{env:environment}:{})});
    let stdout='',stderr='',failure:Error|undefined;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    const terminate=()=>{
      void stopProcessTree(child);
    };
    const abort=()=>{failure=new ReaderError('CANCELLED','操作已取消');terminate();};
    const timeout=setTimeout(()=>{failure=new ReaderError('PROCESS_TIMEOUT','后台转换或工具超过时间限制',408);terminate();},timeoutMs);
    signal.addEventListener('abort',abort,{once:true});
    const finish=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);};
    child.stdout.on('data',data=>{stdout+=data;if(stdout.length>16*1024*1024){failure=new ReaderError('PROCESS_OUTPUT_LIMIT','后台程序输出过大');terminate();}});
    child.stderr.on('data',data=>{stderr+=data;if(stderr.length>1024*1024)stderr=stderr.slice(-1024*1024);});
    child.once('error',()=>{finish();reject(new ReaderError('PROCESS_UNAVAILABLE','无法启动后台程序，请检查安装路径'));});
    child.once('close',code=>{finish();if(failure)reject(failure);else if(code!==0)reject(new ReaderError('PROCESS_FAILED','后台程序失败，退出码 '+String(code)));else resolve({stdout,stderr,exitCode:code??0});});
    child.stdin.on('error',()=>{});child.stdin.end(input??'');
    if(signal.aborted)abort();
  });
}
