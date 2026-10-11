import {randomUUID} from 'node:crypto';import type {LifecycleEvent} from '../../../contracts/src/runs.js';import type {WorkspaceId} from '../../../contracts/src/ids.js';import type {WorkspaceService} from '../workspaces/service.js';import type {CapabilityRegistry} from './registry.js';
export class LifecycleDispatcher{
 private tails=new Map<string,Promise<void>>();private tasks=new Set<Promise<void>>();private closed=false;
 constructor(private registry:CapabilityRegistry,private workspaces:WorkspaceService){}
 private async error(workspaceId:WorkspaceId,id:string,kind:string,code='LIFECYCLE_HOOK_FAILED'){try{const store=await this.workspaces.storeFor(workspaceId);store.putRecord('hook-errors',randomUUID(),{id,kind,code,message:code==='LIFECYCLE_HOOK_FAILED'?'插件事件监听失败':'插件事件队列已满',time:new Date().toISOString()});const records=store.recordEntries('hook-errors');for(const row of records.slice(0,Math.max(0,records.length-200)))store.deleteRecord('hook-errors',row.id);}catch{}}
 emit(event:LifecycleEvent){if(this.closed)return;for(const id of this.registry.list(event.workspaceId,'lifecycle')){
  if(this.tasks.size>=1024){void this.error(event.workspaceId,id,event.kind,'LIFECYCLE_QUEUE_LIMIT');continue;}
  const lease=this.registry.acquire(event.workspaceId,'lifecycle',id),key=event.workspaceId+'/'+id,task=(this.tails.get(key)??Promise.resolve()).then(()=>lease.value.onEvent(structuredClone(event))).catch(()=>this.error(event.workspaceId,id,event.kind)).finally(()=>{lease.release();this.tasks.delete(task);if(this.tails.get(key)===task)this.tails.delete(key);});this.tails.set(key,task);this.tasks.add(task);
 }}
 async close(){this.closed=true;await Promise.allSettled([...this.tasks]);}
}
