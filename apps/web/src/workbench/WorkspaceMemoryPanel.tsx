import {useCallback,useEffect,useState,useId,useRef} from 'react';
import {ChevronDown,ArrowUpRight} from 'lucide-react';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import type {SourceAnchor} from '../../../../packages/contracts/src/documents.js';
import type {WorkspaceMemoryStatus,WorkspaceMemoryHit} from '../../../../packages/contracts/src/workspace-memory.js';
import {api,message,errorText} from '../api/client.js';
import {t,useLocale,localizeMessage} from '../i18n/index.js';
import '../styles/workspace-memory.css';
export function WorkspaceMemoryPanel({workspaceId,onOpen}:{workspaceId:WorkspaceId;onOpen?:(anchor:SourceAnchor)=>void}){
 useLocale();
 const id=useId(),prefix='/workspaces/'+encodeURIComponent(workspaceId)+'/memory';
 const mutationVersion=useRef(0),mutating=useRef(false),searchController=useRef<AbortController|null>(null);
 const [status,setStatus]=useState<WorkspaceMemoryStatus|null>(null),[opened,setOpened]=useState(false),[error,setError]=useState(''),[statusError,setStatusError]=useState(''),[query,setQuery]=useState(''),[hits,setHits]=useState<WorkspaceMemoryHit[]|null>(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const invalidateSearch=useCallback(()=>{const pending=searchController.current;searchController.current=null;pending?.abort();setHits(null);if(pending)setBusy(false);},[]);
 const acceptStatus=useCallback((value:WorkspaceMemoryStatus)=>{setStatus(value);setStatusError('');if(!value.enabled||!value.available||value.state==='indexing')invalidateSearch();},[invalidateSearch]);
 useEffect(()=>{setStatus(null);setError('');setStatusError('');setQuery('');invalidateSearch();return()=>{searchController.current?.abort();};},[workspaceId,invalidateSearch]);
 useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{const version=mutationVersion.current;try{const value=await api.request<WorkspaceMemoryStatus>(prefix,{signal:controller.signal});if(controller.signal.aborted)return;if(!mutating.current&&version===mutationVersion.current)acceptStatus(value);if(opened||value.state==='indexing')timer=setTimeout(()=>void load(),value.state==='indexing'?1000:5000);}catch(error){if(!controller.signal.aborted){if(!mutating.current&&version===mutationVersion.current)setStatusError(errorText(error));if(opened)timer=setTimeout(()=>void load(),5000);}}};
  void load();return()=>{controller.abort();clearTimeout(timer);};
 },[prefix,opened,revision,acceptStatus]);
 const change=async(enabled:boolean)=>{if(busy)return;const previous=status;mutationVersion.current++;mutating.current=true;invalidateSearch();setStatus(value=>value?{...value,enabled,state:enabled?value.available?'idle':'unavailable':'disabled'}:value);setBusy(true);setError('');try{acceptStatus(await api.request<WorkspaceMemoryStatus>(prefix,{method:'PUT',body:{enabled}}));setRevision(value=>value+1);}catch(error){setStatus(previous);setError(errorText(error));}finally{mutating.current=false;setBusy(false);}};
 const refresh=async()=>{if(busy)return;mutationVersion.current++;mutating.current=true;invalidateSearch();setBusy(true);setError('');try{acceptStatus(await api.request<WorkspaceMemoryStatus>(prefix+'/sync',{method:'POST'}));setRevision(value=>value+1);}catch(error){setError(errorText(error));}finally{mutating.current=false;setBusy(false);}};
 const canSearch=Boolean(query.trim()&&status?.enabled&&status.available&&status.indexedFiles&&status.state!=='indexing'&&!statusError);
 const search=async()=>{if(busy||!canSearch)return;const controller=new AbortController();searchController.current=controller;setHits(null);setBusy(true);setError('');try{const value=await api.request<{items:WorkspaceMemoryHit[]}>(prefix+'/search?query='+encodeURIComponent(query.trim()),{signal:controller.signal});if(!controller.signal.aborted&&searchController.current===controller)setHits(value.items);}catch(error){if(!controller.signal.aborted)setError(errorText(error));}finally{if(searchController.current===controller){searchController.current=null;setBusy(false);}}};
 const label=statusError?t('暂时无法读取状态','Status is temporarily unavailable'):!status?t('正在读取状态','Checking status'):status.state==='disabled'?t('已关闭','Disabled'):status.state==='unavailable'?t('尚未准备本地记忆组件','Local memory runtime is not installed'):status.state==='indexing'?t('正在关联 {done} / {total} 份资料','Associating {done} / {total} files',{done:status.indexedFiles,total:status.discoveredFiles}):status.state==='failed'?t('关联暂未完成','Association could not finish'):status.state==='ready'?t('已关联 {count} 份资料','Associated {count} files',{count:status.indexedFiles}):t('等待关联资料','Waiting to associate files');
 return<details className="workspace-memory" role="group" aria-label={t('工作区记忆','Workspace memory')} onToggle={event=>setOpened(event.currentTarget.open)}>
  <summary><span>{t('工作区记忆','Workspace memory')}<small>{t('试验','Experimental')}</small></span><ChevronDown size={13} aria-hidden="true"/></summary>
  <div className="workspace-memory-content">
   <p role="status">{label}</p><p className="subtle">{t('自动关联本工作区内可读取的资料，提问时只取相关内容，并保留原文出处。','Associate readable files in this workspace. Questions retrieve relevant passages with their original sources.')}</p>
   <label className="workspace-memory-switch"><input type="checkbox" checked={status?.enabled??false} disabled={!status||busy} onChange={event=>void change(event.target.checked)}/>{t('自动关联工作区资料','Automatically associate workspace files')}</label>
   {status?.state==='unavailable'&&<p className="subtle">{t('先在应用安装目录运行','In the application directory, run')} <code>node scripts/setup-workspace-memory.mjs</code>{t('，完成后重启工作台。准备期间仍可阅读文档和对话。',', then restart the workbench. Reading and chat remain available while you prepare it.')}</p>}
   <button type="button" disabled={busy||status?.state==='indexing'} onClick={()=>void refresh()}>{status?.available?t('更新关联资料','Refresh associated files'):t('重新检查','Check again')}</button>
   {status?.state==='ready'&&<p className="subtle">{t('{count} 条知识 · {duplicates} 条重复内容已合并','{count} passages · {duplicates} duplicates merged',{count:status.uniquePassages,duplicates:Math.max(0,status.sourcePassages-status.uniquePassages)})}</p>}
   {Boolean(status?.skipped.length)&&<details><summary>{t('查看未关联资料（{count}）','Files not associated ({count})',{count:status!.skipped.length})}</summary><ul>{status!.skipped.map((entry,index)=><li key={entry.relativePath+index}><span>{entry.relativePath}</span><p>{localizeMessage(entry.reason)}</p></li>)}</ul></details>}
   <form onSubmit={event=>{event.preventDefault();void search();}} aria-busy={busy}><label htmlFor={id}>{t('查找关联知识','Search associated knowledge')}</label><input id={id} value={query} maxLength={1000} onChange={event=>{invalidateSearch();setQuery(event.target.value);}} placeholder={t('用自己的话描述问题','Describe your question')}/><button disabled={busy||!canSearch}>{busy?t('处理中…','Working…'):t('检索','Search')}</button></form>
   {hits&&<div aria-label={t('工作区知识检索结果','Workspace knowledge search results')} role="region">{hits.length===0?<p>{t('未找到可用的关联证据。文件更新或删除后，旧内容不会用于回答。','No usable related evidence was found. Changed or deleted source content is excluded from answers.')}</p>:<ol>{hits.map(hit=><li key={hit.id}><p>{hit.text}</p>{hit.sources.map((source,index)=><button type="button" key={source.relativePath+index} disabled={!onOpen} onClick={()=>onOpen?.(source.anchor)} title={source.relativePath}>{source.relativePath} · {t('第 {page} 页','Page {page}',{page:source.page})}<ArrowUpRight size={12} aria-hidden="true"/></button>)}</li>)}</ol>}</div>}
   {(error||statusError||status?.error)&&<p role="alert" className="error">{localizeMessage(error||statusError||status?.error||'')}</p>}
  </div>
 </details>;
}
