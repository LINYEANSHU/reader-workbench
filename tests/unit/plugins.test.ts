import {describe,expect,it} from 'vitest';
import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
import {PluginManager} from '../../packages/core/src/plugins/manager.js';
import type {WorkspaceId} from '../../packages/contracts/src/ids.js';
import type {ToolProvider} from '../../packages/sdk/src/capabilities.js';
import type {PluginContext} from '../../packages/sdk/src/plugin-context.js';
const workspace='workspace-test' as WorkspaceId;
const manifest=(id:string,dependencies:string[]=[])=>({id,version:'1.0.0',sdkRange:'^1.0.0',entry:'index.mjs',dependencies,settingsSchema:{type:'object'},permissions:['tool:read']});
const provider:ToolProvider={tools:[{name:'lookup_term',inputSchema:{type:'object'},effect:'read',execute:async()=>({content:'术语'})}]};
describe('plugin capabilities',()=>{
  it('rolls back activation failures and releases only its own capabilities',async()=>{
    const registry=new CapabilityRegistry(),manager=new PluginManager(registry);
    await manager.enablePlugin({manifest:manifest('reader-helper'),activate:async(ctx:PluginContext)=>{ctx.register('tool','reader-helper.lookup_term',provider);}},workspace);
    expect(registry.list(workspace,'tool')).toContain('reader-helper.lookup_term');
    await expect(manager.enablePlugin({manifest:manifest('broken'),activate:async(ctx:PluginContext)=>{ctx.register('tool','broken.temp',provider);throw new Error('activate failed');}},workspace)).rejects.toThrow('activate failed');
    expect(registry.list(workspace,'tool')).not.toContain('broken.temp');
    await manager.disable('reader-helper',workspace);
    expect(registry.list(workspace,'tool')).not.toContain('reader-helper.lookup_term');
  });
  it('rejects SDK mismatches, missing dependencies, cycles and duplicate registration',async()=>{
    const registry=new CapabilityRegistry(),manager=new PluginManager(registry);
    await expect(manager.enablePlugin({manifest:{...manifest('incompatible'),sdkRange:'^9.0.0'},activate:async()=>{}},workspace)).rejects.toMatchObject({code:'SDK_INCOMPATIBLE'});
    await expect(manager.enablePlugin({manifest:manifest('dependent',['missing']),activate:async()=>{}},workspace)).rejects.toMatchObject({code:'PLUGIN_DEPENDENCY_MISSING'});
    await expect(manager.enablePlugin({manifest:manifest('cycle',['cycle']),activate:async()=>{}},workspace)).rejects.toMatchObject({code:'PLUGIN_DEPENDENCY_CYCLE'});
    registry.register(workspace,'tool','duplicate',provider,'one');
    expect(()=>registry.register(workspace,'tool','duplicate',provider,'two')).toThrow(/CAPABILITY_DUPLICATE|重复/);
  });
  it('blocks new leases on disable but waits for an existing run before disposal',async()=>{
    const registry=new CapabilityRegistry(),manager=new PluginManager(registry);let disposed=false;
    await manager.enablePlugin({manifest:manifest('held'),activate:async(ctx:PluginContext)=>{ctx.register('tool','held.lookup',provider);},dispose:async()=>{disposed=true;}},workspace);
    const lease=registry.acquire(workspace,'tool','held.lookup');
    const disabling=manager.disable('held',workspace);
    await Promise.resolve();
    expect(()=>registry.get(workspace,'tool','held.lookup')).toThrow();
    expect(disposed).toBe(false);
    expect(lease.value).toEqual(provider);
    lease.release();await disabling;expect(disposed).toBe(true);
  });
  it('reports lifecycle failures after running other listeners and isolates workspaces',async()=>{
    const registry=new CapabilityRegistry();let seen=0;
    registry.register(workspace,'lifecycle','failing',{onEvent:async()=>{throw new Error('listener failure');}});
    registry.register(workspace,'lifecycle','working',{onEvent:async()=>{seen++;}});
    expect(registry.list('another' as WorkspaceId,'lifecycle')).toEqual([]);
    await expect(registry.emitLifecycle({kind:'test',workspaceId:workspace,data:{}})).rejects.toMatchObject({code:'LIFECYCLE_HOOK_FAILED'});
    expect(seen).toBe(1);
  });
});
