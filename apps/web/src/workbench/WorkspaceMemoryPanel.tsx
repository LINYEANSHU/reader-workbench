import {useEffect,useState,useId,useRef} from 'react';
import {ChevronDown,ArrowUpRight} from 'lucide-react';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import type {SourceAnchor} from '../../../../packages/contracts/src/documents.js';
import type {WorkspaceMemoryStatus,WorkspaceMemoryHit} from '../../../../packages/contracts/src/workspace-memory.js';
import {api,message} from '../api/client.js';
import '../styles/workspace-memory.css';
export function WorkspaceMemoryPanel({workspaceId,onOpen}:{workspaceId:WorkspaceId;onOpen?:(anchor:SourceAnchor)=>void}){
 const id=useId(),prefix='/workspaces/'+encodeURIComponent(workspaceId)+'/memory';
 const mutationVersion=useRef(0),mutating=useRef(false);
 const [status,setStatus]=useState<WorkspaceMemoryStatus|null>(null),[opened,setOpened]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[hits,setHits]=useState<WorkspaceMemoryHit[]|null>(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{setStatus(null);setError('');setHits(null);setQuery('');},[workspaceId]);
 useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{const version=mutationVersion.current;try{const value=await api.request<WorkspaceMemoryStatus>(prefix,{signal:controller.signal});if(controller.signal.aborted)return;if(!mutating.current&&version===mutationVersion.current)setStatus(value);if(opened||value.state==='indexing')timer=setTimeout(()=>void load(),value.state==='indexing'?1000:5000);}catch(error){if(!controller.signal.aborted)setError(message(error));}};
  void load();return()=>{controller.abort();clearTimeout(timer);};
 },[prefix,opened,revision]);
 const change=async(enabled:boolean)=>{const previous=status;mutationVersion.current++;mutating.current=true;setStatus(value=>value?{...value,enabled,state:enabled?value.available?'idle':'unavailable':'disabled'}:value);setBusy(true);setError('');try{setStatus(await api.request<WorkspaceMemoryStatus>(prefix,{method:'PUT',body:{enabled}}));setHits(null);setRevision(value=>value+1);}catch(error){setStatus(previous);setError(message(error));}finally{mutating.current=false;setBusy(false);}};
 const refresh=async()=>{setBusy(true);setError('');try{setStatus(await api.request<WorkspaceMemoryStatus>(prefix+'/sync',{method:'POST'}));setRevision(value=>value+1);}catch(error){setError(message(error));}finally{setBusy(false);}};
 const search=async()=>{setBusy(true);setError('');try{const value=await api.request<{items:WorkspaceMemoryHit[]}>(prefix+'/search?query='+encodeURIComponent(query));setHits(value.items);}catch(error){setError(message(error));}finally{setBusy(false);}};
 const label=!status?'正在读取状态':status.state==='disabled'?'已关闭':status.state==='unavailable'?'尚未准备本地记忆组件':status.state==='indexing'?'正在关联 '+status.indexedFiles+' / '+status.discoveredFiles+' 份资料':status.state==='failed'?'关联暂未完成':status.state==='ready'?'已关联 '+status.indexedFiles+' 份资料':'等待关联资料';
 return<details className="workspace-memory" role="group" aria-label="工作区记忆" onToggle={event=>setOpened(event.currentTarget.open)}>
  <summary><span>工作区记忆<small>试验</small></span><ChevronDown size={13} aria-hidden="true"/></summary>
  <div className="workspace-memory-content">
   <p role="status">{label}</p><p className="subtle">自动关联本工作区内可读取的资料，提问时只取相关内容，并保留原文出处。</p>
   <label className="workspace-memory-switch"><input type="checkbox" checked={status?.enabled??false} disabled={!status||busy} onChange={event=>void change(event.target.checked)}/>自动关联工作区资料</label>
   <button type="button" disabled={busy||status?.state==='indexing'} onClick={()=>void refresh()}>{status?.available?'更新关联资料':'重新检查'}</button>
   {status?.state==='ready'&&<p className="subtle">{status.uniquePassages} 条知识 · {Math.max(0,status.sourcePassages-status.uniquePassages)} 条重复内容已合并</p>}
   {Boolean(status?.skipped.length)&&<details><summary>查看未关联资料（{status!.skipped.length}）</summary><ul>{status!.skipped.map((entry,index)=><li key={entry.relativePath+index}><span>{entry.relativePath}</span><p>{entry.reason}</p></li>)}</ul></details>}
   <form onSubmit={event=>{event.preventDefault();void search();}}><label htmlFor={id}>查找关联知识</label><input id={id} value={query} maxLength={1000} onChange={event=>setQuery(event.target.value)} placeholder="用自己的话描述问题"/><button disabled={busy||!query.trim()||!status?.enabled||!status.available||!status.indexedFiles||status.state==='indexing'}>{busy?'处理中…':'检索'}</button></form>
   {hits&&<div aria-label="工作区知识检索结果" role="region">{hits.length===0?<p>未找到可用的关联证据。文件更新或删除后，旧内容不会用于回答。</p>:<ol>{hits.map(hit=><li key={hit.id}><p>{hit.text}</p>{hit.sources.map((source,index)=><button type="button" key={source.relativePath+index} disabled={!onOpen} onClick={()=>onOpen?.(source.anchor)} title={source.relativePath}>{source.relativePath} · 第 {source.page} 页<ArrowUpRight size={12} aria-hidden="true"/></button>)}</li>)}</ol>}</div>}
   {(error||status?.error)&&<p role="alert" className="error">{error||status?.error}</p>}
  </div>
 </details>;
}
