import type {CapabilityMap} from '../../../sdk/src/capabilities.js';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {LifecycleEvent} from '../../../contracts/src/runs.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import type {ContextEnvelope} from '../../../contracts/src/sessions.js';
export function validateContextTransform(before:ContextEnvelope,after:ContextEnvelope):void{
  const key=(reference:{workspaceId:string;documentId:string;version:string})=>reference.workspaceId+'/'+reference.documentId+'/'+reference.version;
  const allowed=new Set([...before.documents,...before.sourceRanges].map(key));
  if(after.workspaceId!==before.workspaceId||after.sessionId!==before.sessionId||after.mainRevision!==before.mainRevision||after.ownRevision!==before.ownRevision||
    [...after.documents,...after.sourceRanges].some(ref=>ref.workspaceId!==before.workspaceId||!allowed.has(key(ref)))||
    after.summaryCoverage.some(turn=>!before.summaryCoverage.includes(turn))||
    after.memory&&(!before.memory||after.memory.revision!==before.memory.revision||after.memory.parentRevision!==before.memory.parentRevision||[...after.memory.turnIds,...after.memory.parentTurnIds??[]].some(id=>!before.summaryCoverage.includes(id))))
    throw new ReaderError('TOOL_SCOPE_DENIED','上下文变换越过已授权的文档或会话权限',403);
}
interface Entry {workspaceId:string;kind:keyof CapabilityMap;id:string;value:unknown;owner:string;active:boolean;leases:number;idle:Array<()=>void>}
export class CapabilityRegistry {
  private entries=new Map<string,Entry>();
  private key(workspaceId:string,kind:keyof CapabilityMap,id:string){return workspaceId+'\0'+kind+'\0'+id;}
  register<K extends keyof CapabilityMap>(workspaceId:WorkspaceId|'*',kind:K,id:string,value:CapabilityMap[K],owner='core'):()=>void{
    const key=this.key(workspaceId,kind,id);
    if(this.entries.get(key)?.active)throw new ReaderError('CAPABILITY_DUPLICATE','能力重复注册: '+id);
    if(kind==='tool'){
      const tools=(value as CapabilityMap['tool']).tools.map(tool=>Object.freeze({...tool,inputSchema:structuredClone(tool.inputSchema)}));
      value=Object.freeze({tools:Object.freeze(tools)}) as unknown as CapabilityMap[K];
    }
    const entry:Entry={workspaceId,kind,id,value,owner,active:true,leases:0,idle:[]};this.entries.set(key,entry);
    return ()=>this.retire(key,entry);
  }
  private retire(key:string,entry:Entry){entry.active=false;if(!entry.leases){if(this.entries.get(key)===entry)this.entries.delete(key);entry.idle.splice(0).forEach(fn=>fn());}}
  private entry(workspaceId:WorkspaceId,kind:keyof CapabilityMap,id:string):Entry{
    const entry=this.entries.get(this.key(workspaceId,kind,id))??this.entries.get(this.key('*',kind,id));
    if(!entry?.active)throw new ReaderError('CAPABILITY_UNAVAILABLE','能力不可用: '+kind+'/'+id,409);return entry;
  }
  get<K extends keyof CapabilityMap>(workspaceId:WorkspaceId,kind:K,id:string):CapabilityMap[K]{return this.entry(workspaceId,kind,id).value as CapabilityMap[K];}
  list(workspaceId:WorkspaceId,kind:keyof CapabilityMap):string[]{return [...new Set([...this.entries.values()].filter(e=>e.active&&e.kind===kind&&(e.workspaceId===workspaceId||e.workspaceId==='*')).map(e=>e.id))];}
  acquire<K extends keyof CapabilityMap>(workspaceId:WorkspaceId,kind:K,id:string):{value:CapabilityMap[K];release():void}{
    const entry=this.entry(workspaceId,kind,id);entry.leases++;let released=false;
    return {value:entry.value as CapabilityMap[K],release:()=>{if(released)return;released=true;entry.leases--;if(!entry.active)this.retire(this.key(entry.workspaceId,kind,id),entry);}};
  }
  retireOwner(workspaceId:WorkspaceId,owner:string):Promise<void>{
    const waits:Promise<void>[]=[];
    for(const [key,entry]of this.entries){if(entry.workspaceId!==workspaceId||entry.owner!==owner)continue;
      if(entry.leases)waits.push(new Promise<void>(resolve=>entry.idle.push(resolve)));this.retire(key,entry);}
    return Promise.all(waits).then(()=>{});
  }
  async emitLifecycle(event:LifecycleEvent):Promise<void>{
    const results=await Promise.allSettled(this.list(event.workspaceId,'lifecycle').map(async id=>{
      const lease=this.acquire(event.workspaceId,'lifecycle',id);try{await lease.value.onEvent(event);}finally{lease.release();}
    }));
    if(results.some(result=>result.status==='rejected'))throw new ReaderError('LIFECYCLE_HOOK_FAILED','插件事件监听失败；其他监听器已执行',500);
  }
}
