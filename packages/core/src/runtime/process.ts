import {spawn} from 'node:child_process';
import {ReaderError} from '../../../contracts/src/errors.js';
export interface ProcessResult {stdout:string;stderr:string;exitCode:number}
export async function runProcess(command:string,args:string[],signal:AbortSignal,timeoutMs:number,input?:string):Promise<ProcessResult>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',failure:Error|undefined;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    const terminate=()=>{
      if(!child.pid)return;
      if(process.platform==='win32'){
        const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());killer.on('exit',code=>{if(code!==0)child.kill();});
      }else {try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
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
