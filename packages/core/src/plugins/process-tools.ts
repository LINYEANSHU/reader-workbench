import {randomUUID} from 'node:crypto';
import {getDefaultEnvironment} from '@modelcontextprotocol/client/stdio';
import type {ProcessToolSpec,ToolDefinition} from '../../../contracts/src/tools.js';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {runProcess} from '../runtime/process.js';
import type {CapabilityRegistry} from './registry.js';
export function processTool(raw:ProcessToolSpec):ToolDefinition{
 const spec=structuredClone(raw);if(!spec.command||!Array.isArray(spec.args)||spec.args.some(arg=>typeof arg!=='string')||!Number.isSafeInteger(spec.timeoutMs)||spec.timeoutMs<10||spec.timeoutMs>120000)throw new ReaderError('PROCESS_SPEC_INVALID','进程工具的命令、参数或超时无效');
 return{...spec.tool,async execute(input,scope,signal){
  const id=randomUUID(),request={version:1,id,tool:spec.tool.name,input,scope:{workspaceId:scope.workspaceId,sessionId:scope.sessionId,runId:scope.runId,callerId:scope.actor.callerId,allowArtifactWrites:scope.allowArtifactWrites,readRevisions:scope.readRevisions}};
  const result=await runProcess(spec.command,spec.args,signal,spec.timeoutMs,JSON.stringify(request)+'\n',{...getDefaultEnvironment(),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'});
  const lines=result.stdout.trim().split(/\r?\n/);let response:Record<string,unknown>;try{if(lines.length!==1)throw new Error();response=JSON.parse(lines[0]!) as Record<string,unknown>;}catch{throw new ReaderError('PROCESS_PROTOCOL_INVALID','进程工具必须返回一行 JSON，诊断请写入 stderr');}
  if(response.version!==1||response.id!==id)throw new ReaderError('PROCESS_PROTOCOL_INVALID','进程工具响应标识或版本不一致');
  if(response.error)throw new ReaderError('PROCESS_TOOL_FAILED','进程工具报告失败');
  if(!Object.hasOwn(response,'result'))throw new ReaderError('PROCESS_PROTOCOL_INVALID','进程工具没有返回结果');
  return{content:JSON.stringify(response.result),data:response.result};
 }};
}
export function registerProcessTool(registry:CapabilityRegistry,spec:ProcessToolSpec,workspaceId:WorkspaceId,owner='core'){
 processTool(spec);return registry.register(workspaceId,'process',spec.tool.name,{specs:[structuredClone(spec)]},owner);
}
