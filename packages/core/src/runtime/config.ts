import { resolve } from 'node:path';
import envPaths from 'env-paths';
import type { RuntimeConfig } from '../../../contracts/src/runtime.js';
import { ReaderError } from '../../../contracts/src/errors.js';
export async function loadRuntimeConfig(args:string[]):Promise<RuntimeConfig> {
  const config:RuntimeConfig={host:'127.0.0.1',port:4317,configDir:envPaths('reader-workbench',{suffix:''}).config,noOpen:false,demo:false};
  const tokens=[...args];if(tokens[0]==='web'||tokens[0]==='doctor')tokens.shift();
  const values:Record<string,'host'|'port'|'configDir'|'workspace'>={'--host':'host','--port':'port','--config-dir':'configDir','--workspace':'workspace'};
  while(tokens.length){
    const flag=tokens.shift()!;
    if(flag==='--no-open'){config.noOpen=true;continue;}
    if(flag==='--demo'){config.demo=true;continue;}
    const key=values[flag];if(!key)throw new ReaderError('INVALID_ARGUMENT','未知参数: '+flag);
    const value=tokens.shift();if(!value||value.startsWith('--'))throw new ReaderError('INVALID_ARGUMENT','参数缺少值: '+flag);
    if(key==='port'){if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535)throw new ReaderError('INVALID_ARGUMENT','port 端口必须为 1–65535');config.port=Number(value);}
    else config[key]=key==='configDir'||key==='workspace'?resolve(value):value;
  }
  if(!config.host.trim()||/[\s/\\]/.test(config.host))throw new ReaderError('INVALID_ARGUMENT','host 无效');
  return config;
}
