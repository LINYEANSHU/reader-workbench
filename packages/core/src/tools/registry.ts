import type {WorkspaceId,RunScope} from '../../../contracts/src/ids.js';
import type {ToolDefinition} from '../../../contracts/src/tools.js';
import type {SessionRecord} from '../../../contracts/src/sessions.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {CapabilityRegistry} from '../plugins/registry.js';
import {assertToolAllowed} from './policy.js';
import {processTool} from '../plugins/process-tools.js';
export class ToolRegistry {
  constructor(private capabilities:CapabilityRegistry,private authorizeScope:(scope:RunScope)=>Promise<SessionRecord>){}
  list(workspaceId:WorkspaceId):ToolDefinition[]{
    const definitions=[...this.capabilities.list(workspaceId,'tool').flatMap(id=>this.capabilities.get(workspaceId,'tool',id).tools),...this.capabilities.list(workspaceId,'process').flatMap(id=>this.capabilities.get(workspaceId,'process',id).specs.map(processTool))];
    const names=new Set<string>();for(const tool of definitions){if(names.has(tool.name))throw new ReaderError('TOOL_DUPLICATE','工具名称重复: '+tool.name);names.add(tool.name);}return definitions;
  }
  async acquire(name:string,scope:RunScope){
    const session=await this.authorizeScope(scope);
    for(const id of this.capabilities.list(scope.workspaceId,'tool')){
      const lease=this.capabilities.acquire(scope.workspaceId,'tool',id);
      const definition=lease.value.tools.find(tool=>tool.name===name);
      if(definition){try{assertToolAllowed(definition,scope,session);return {definition,release:lease.release};}catch(error){lease.release();throw error;}}
      lease.release();
    }
    for(const id of this.capabilities.list(scope.workspaceId,'process')){
      const lease=this.capabilities.acquire(scope.workspaceId,'process',id);const spec=lease.value.specs.find(spec=>spec.tool.name===name);
      if(spec){try{const definition=processTool(spec);assertToolAllowed(definition,scope,session);return{definition,release:lease.release};}catch(error){lease.release();throw error;}}lease.release();
    }
    throw new ReaderError('TOOL_UNAVAILABLE','工具不存在或已停用: '+name,404);
  }
}
