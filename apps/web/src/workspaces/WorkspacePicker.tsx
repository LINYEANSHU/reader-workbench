import {useEffect,useRef,useState} from 'react';
import {Folder,ArrowUp,ArrowLeft,ArrowRight,ChevronRight,ChevronDown,Search,X} from 'lucide-react';
import type {Workspace,DirectoryBrowser,DirectoryEntry} from '../../../../packages/contracts/src/workspaces.js';
import {api,message,errorText} from '../api/client.js';
import {t,useLocale} from '../i18n/index.js';
import '../styles/workspace-picker.css';

const requestDirectory=(path:string,signal?:AbortSignal)=>api.request<DirectoryBrowser>('/directories/browser?path='+encodeURIComponent(path),{signal});

function breadcrumbs(path:string):DirectoryEntry[]{
 const windows=/^(?:[a-z]:[\\/]|\\\\)/i.test(path),separator=windows?'\\':'/';
 const root=windows?(path.startsWith('\\\\')?path.match(/^\\\\[^\\]+\\[^\\]+\\?/)?.[0]??'':path.slice(0,3)):'/';
 let current=root.endsWith(separator)?root:root+separator;
 const parts=path.slice(root.length).split(/[\\/]/).filter(Boolean),result:DirectoryEntry[]=[{name:root,path:current}];
 for(const name of parts){current=current.replace(/[\\/]+$/,'')+separator+name;result.push({name,path:current});}return result;
}

function DirectoryTreeNode({entry,current,onNavigate,depth=0}:{entry:DirectoryEntry;current:string;onNavigate:(path:string)=>void;depth?:number}){
 useLocale();
 const [expanded,setExpanded]=useState(false),[children,setChildren]=useState<DirectoryEntry[]>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{if(!expanded||children)return;const controller=new AbortController();setLoading(true);setError('');requestDirectory(entry.path,controller.signal).then(result=>{setChildren(result.entries);setLoading(false);}).catch(cause=>{if(!controller.signal.aborted){setError(errorText(cause));setLoading(false);}});return()=>controller.abort();},[expanded,entry.path,children]);
 return<li><div className={'directory-tree-row '+(entry.path===current?'selected':'')}>
  <button type="button" className="directory-expand" disabled={depth>=12} aria-label={expanded?t('折叠目录：{name}','Collapse folder: {name}',{name:entry.name}):t('展开目录：{name}','Expand folder: {name}',{name:entry.name})} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button>
  <button type="button" className="directory-tree-open" title={entry.path} onClick={()=>onNavigate(entry.path)}><Folder size={15}/><span>{entry.name}</span></button>
 </div>{expanded&&<div className="directory-tree-children">{loading&&<p role="status">{t('正在读取…','Loading…')}</p>}{error&&<p className="error" role="alert">{message(error)}<button type="button" onClick={()=>{setExpanded(false);setError('');}}>{t('收起后重试','Collapse and retry')}</button></p>}{children?.length===0&&<p>{t('没有子目录','No subfolders')}</p>}{children&&<ul>{children.map(child=><DirectoryTreeNode key={child.path} entry={child} current={current} onNavigate={onNavigate} depth={depth+1}/>)}</ul>}</div>}</li>;
}

export function WorkspacePicker({recent,onPick,onClose,initialPath=''}:{recent:Workspace[];onPick:(workspace:Workspace)=>void;onClose:()=>void;initialPath?:string}){
 useLocale();
 const [address,setAddress]=useState(initialPath),[location,setLocation]=useState<DirectoryBrowser>(),[filter,setFilter]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[initialized,setInitialized]=useState(false),[history,setHistory]=useState<{paths:string[];index:number}>({paths:[],index:-1});
 const pending=useRef<AbortController|null>(null),revision=useRef(0),historyRef=useRef(history),mounted=useRef(true);
 const browse=async(value:string,index?:number):Promise<DirectoryBrowser|undefined>=>{
  const request=++revision.current;pending.current?.abort();const controller=new AbortController();pending.current=controller;setLoading(true);setError('');
  try{
   const result=await requestDirectory(value,controller.signal);if(request!==revision.current||!mounted.current)return;
   setLocation(result);setAddress(result.path);setFilter('');
   const previous=historyRef.current;
   let next=previous;
   if(index!==undefined)next={paths:previous.paths,index};
   else if(previous.paths[previous.index]!==result.path){const paths=[...previous.paths.slice(0,previous.index+1),result.path].slice(-50);next={paths,index:paths.length-1};}
   historyRef.current=next;setHistory(next);return result;
  }catch(cause){if(request===revision.current&&!controller.signal.aborted&&mounted.current)setError(errorText(cause));}
  finally{if(request===revision.current&&mounted.current)setLoading(false);}
 };
 useEffect(()=>{mounted.current=true;void browse(initialPath).finally(()=>{if(mounted.current)setInitialized(true);});return()=>{mounted.current=false;++revision.current;pending.current?.abort();};},[]);
 const edit=(value:string)=>{++revision.current;pending.current?.abort();setLoading(false);setAddress(value);setError('');};
 const open=async()=>{
  if(busy||loading||!address.trim())return;setBusy(true);setError('');
  try{
   const selected=location?.path===address?location:await browse(address);if(!selected||!mounted.current)return;
   const request=revision.current,workspace=await api.selectWorkspace(selected.path);if(mounted.current&&request===revision.current)onPick(workspace);
  }catch(cause){if(mounted.current)setError(errorText(cause));}finally{if(mounted.current)setBusy(false);}
 };
 const navigate=(path:string)=>{if(!busy)void browse(path);};
 const entries=location?.entries.filter(entry=>entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))??[];
 const crumbs=location?breadcrumbs(location.path):[];
 return<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><section className="dialog workspace-dialog" role="dialog" aria-modal="true" aria-label={t('选择工作区','Choose workspace')} onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();onClose();}}}>
  <header><h2>{t('选择工作区','Choose workspace')}</h2><button type="button" className="icon-button" aria-label={t('关闭','Close')} disabled={busy} onClick={onClose}><X size={18}/></button></header>
  <p className="subtle workspace-intro">{t('浏览运行这台服务的计算机。原文件直接打开，生成的文件保存在所选工作区。','Browse the computer running this service. Source files open directly; generated files are saved in the selected workspace.')}</p>
  <div className="workspace-navigation"><div className="directory-history">
   <button type="button" className="icon-button" aria-label={t('后退','Back')} data-tooltip={t('返回上次浏览的目录','Return to the previous folder')} disabled={busy||history.index<=0} onClick={()=>void browse(history.paths[history.index-1]!,history.index-1)}><ArrowLeft size={16}/></button>
   <button type="button" className="icon-button" aria-label={t('前进','Forward')} data-tooltip={t('前往下一条浏览记录','Go to the next folder in your history')} disabled={busy||history.index>=history.paths.length-1} onClick={()=>void browse(history.paths[history.index+1]!,history.index+1)}><ArrowRight size={16}/></button>
   <button type="button" className="icon-button" aria-label={t('上一级','Up one level')} data-tooltip={t('浏览当前目录的上一级','Browse the parent folder')} disabled={busy||!location?.parent} onClick={()=>{if(location?.parent)navigate(location.parent);}}><ArrowUp size={16}/></button>
  </div><div className="path-entry"><label className="sr-only" htmlFor="workspace-path">{t('工作区目录','Workspace directory')}</label><input id="workspace-path" autoFocus placeholder={t('输入目录路径','Enter a folder path')} value={address} disabled={busy||!initialized} onChange={event=>edit(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void browse(address);}}}/><button type="button" disabled={busy} onClick={()=>void browse(address)}>{t('浏览目录','Browse')}</button></div></div>
  {location&&<nav className="directory-breadcrumbs" aria-label={t('目录路径','Folder path')}>{crumbs.map((crumb,index)=><span key={crumb.path}>{index>0&&<ChevronRight size={12} aria-hidden="true"/>}<button type="button" disabled={busy} aria-current={index===crumbs.length-1?'location':undefined} title={crumb.path} onClick={()=>navigate(crumb.path)}>{crumb.name}</button></span>)}</nav>}
  <div className="directory-explorer"><aside className="directory-locations" aria-label={t('常用位置与目录树','Favorite locations and folder tree')}>
   {recent.length>0&&<div className="directory-recents"><h3>{t('最近工作区','Recent workspaces')}</h3>{recent.slice(0,5).map(workspace=><button type="button" key={workspace.id} disabled={busy} title={workspace.root} onClick={()=>navigate(workspace.root)}><Folder size={15}/><span>{workspace.name}</span></button>)}</div>}
   <h3>{t('本机目录','Local folders')}</h3><ul className="directory-tree">{location?.roots.map(root=><DirectoryTreeNode key={root.path} entry={root} current={location.path} onNavigate={navigate}/>)}</ul>
  </aside><div className="directory-contents" aria-busy={loading}>
   <div className="directory-filter"><Search size={15} aria-hidden="true"/><input aria-label={t('筛选当前目录','Filter this folder')} placeholder={t('筛选当前目录','Filter this folder')} disabled={busy} value={filter} onChange={event=>setFilter(event.target.value)}/></div>
   <div className="directory-list">{loading?<div className="directory-loading" role="status">{t('正在读取目录…','Loading folders…')}</div>:entries.length?entries.map(entry=><button type="button" key={entry.path} aria-label={t('进入目录：{name}','Open folder: {name}',{name:entry.name})} disabled={busy} onClick={()=>navigate(entry.path)}><Folder size={17}/><span>{entry.name}</span><ChevronRight size={14} aria-hidden="true"/></button>):<p className="directory-empty">{filter?t('没有匹配的子目录，试试其他名称。','No matching subfolders. Try another name.'):t('此目录没有子目录，可以直接打开此工作区。','This folder has no subfolders. You can open it as a workspace.')}</p>}</div>
  </div></div>
  <div className="workspace-selection"><span>{t('所选目录','Selected folder')}</span><output role="status" aria-label={t('所选目录','Selected folder')}>{location?.path??t('请选择目录','Choose a folder')}</output>{location&&address!==location.path&&<small>{t('地址已修改，打开时将先验证新目录。','The path has changed. The new folder will be verified before opening.')}</small>}</div>
  {error&&<p className="error" role="alert">{message(error)}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>{t('取消','Cancel')}</button><button type="button" className="primary" data-tooltip={t('将当前目录作为阅读工作区，原文件保留在原位置','Open this folder as a reading workspace; source files stay in place')} disabled={busy||loading||!initialized||!address.trim()} onClick={()=>void open()}>{busy?t('正在打开…','Opening…'):t('打开此工作区','Open workspace')}</button></footer>
 </section></div>;
}
