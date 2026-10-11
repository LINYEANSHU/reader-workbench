import {describe,expect,it} from 'vitest';
import {assertToolAllowed} from '../../packages/core/src/tools/policy.js';
import type {RunScope,SessionId,WorkspaceId} from '../../packages/contracts/src/ids.js';
import type {SessionRecord} from '../../packages/contracts/src/sessions.js';
import {CapabilityRegistry,validateContextTransform} from '../../packages/core/src/plugins/registry.js';
import type {ContextEnvelope} from '../../packages/contracts/src/sessions.js';
import {ToolRegistry} from '../../packages/core/src/tools/registry.js';
import {ReaderError} from '../../packages/contracts/src/errors.js';
const scope={actor:{callerId:'local-owner',transport:'internal'},workspaceId:'A',sessionId:'temp',runId:'r',allowArtifactWrites:false} as RunScope;
const temporary={id:'temp',workspaceId:'A',kind:'temporary',parentMainSessionId:'parent',revision:0} as SessionRecord;
describe('tool scope policy',()=>{
  it('rejects a context transform that adds references from another workspace',()=>{
    const envelope={workspaceId:scope.workspaceId,sessionId:scope.sessionId,mainRevision:2,documents:[],messages:[],sourceRanges:[],budget:{limit:1000,inputTokens:0,reservedOutputTokens:100},summaryCoverage:[]} as ContextEnvelope;
    expect(()=>validateContextTransform(envelope,structuredClone(envelope))).not.toThrow();
    expect(()=>validateContextTransform(envelope,{...envelope,workspaceId:'B' as WorkspaceId})).toThrow(/权限|TOOL_SCOPE_DENIED/);
    expect(()=>validateContextTransform(envelope,{...envelope,documents:[{workspaceId:scope.workspaceId,documentId:'unapproved',version:'fake'}] as ContextEnvelope['documents']})).toThrow();
  });
  it('temporary tool execution cannot mutate its parent',()=>{
    const parentBefore={messages:['main'],revision:1};const parentAfter=structuredClone(parentBefore);
    for(const effect of ['write_session','external_write','write_artifact'])expect(()=>assertToolAllowed({effect},scope,temporary)).toThrow(/TOOL_SCOPE_DENIED|权限/);
    expect(()=>assertToolAllowed({effect:'read'},scope,temporary)).not.toThrow();
    expect(()=>assertToolAllowed({effect:'write_artifact'},{...scope,allowArtifactWrites:true},temporary)).not.toThrow();
    expect(parentAfter).toEqual(parentBefore);
    expect(()=>assertToolAllowed({effect:'read'},{...scope,sessionId:'parent' as SessionId},temporary)).toThrow();
    expect(()=>assertToolAllowed({effect:'read'},{...scope,workspaceId:'B' as WorkspaceId},temporary)).toThrow();
    expect(()=>assertToolAllowed({effect:'imaginary'},scope,temporary)).toThrow();
  });
  it('checks the registered scope and preserves effect metadata when a caller tampers',async()=>{
    const capabilities=new CapabilityRegistry();
    const tool={name:'restricted',inputSchema:{type:'object'},effect:'external_write' as const,execute:async()=>({content:'must never execute'})};
    capabilities.register(scope.workspaceId,'tool','restricted',{tools:[tool]});
    const tools=new ToolRegistry(capabilities,async proposed=>{
      if(JSON.stringify(proposed)!==JSON.stringify(scope))throw new ReaderError('TOOL_SCOPE_DENIED','不属于此运行');
      return temporary;
    });
    await expect(tools.acquire('restricted',scope)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
    Object.assign(tool,{effect:'read'});
    await expect(tools.acquire('restricted',scope)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
    await expect(tools.acquire('restricted',{...scope,sessionId:'parent' as SessionId})).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
  });
});
