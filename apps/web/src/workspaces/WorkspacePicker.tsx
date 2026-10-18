import {useEffect,useRef,useState} from 'react';
import {Folder,ArrowUp,ArrowLeft,ArrowRight,ChevronRight,ChevronDown,Search,X} from 'lucide-react';
import type {Workspace,DirectoryBrowser,DirectoryEntry} from '../../../../packages/contracts/src/workspaces.js';
import {api,message} from '../api/client.js';
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
 const [expanded,setExpanded]=useState(false),[children,setChildren]=useState<DirectoryEntry[]>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{if(!expanded||children)return;const controller=new AbortController();setLoading(true);setError('');requestDirectory(entry.path,controller.signal).then(result=>{setChildren(result.entries);setLoading(false);}).catch(cause=>{if(!controller.signal.aborted){setError(message(cause));setLoading(false);}});return()=>controller.abort();},[expanded,entry.path,children]);
 return<li><div className={'directory-tree-row '+(entry.path===current?'selected':'')}>
  <button type="button" className="directory-expand" disabled={depth>=12} aria-label={(expanded?'折叠目录：':'展开目录：')+entry.name} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button>
  <button type="button" className="directory-tree-open" title={entry.path} onClick={()=>onNavigate(entry.path)}><Folder size={15}/><span>{entry.name}</span></button>
 </div>{expanded&&<div className="directory-tree-children">{loading&&<p role="status">正在读取…</p>}{error&&<p className="error" role="alert">{error}<button type="button" onClick={()=>{setExpanded(false);setError('');}}>收起后重试</button></p>}{children?.length===0&&<p>没有子目录</p>}{children&&<ul>{children.map(child=><DirectoryTreeNode key={child.path} entry={child} current={current} onNavigate={onNavigate} depth={depth+1}/>)}</ul>}</div>}</li>;
}

export function WorkspacePicker({recent,onPick,onClose}:{recent:Workspace[];onPick:(workspace:Workspace)=>void;onClose:()=>void}){
 const [address,setAddress]=useState(''),[location,setLocation]=useState<DirectoryBrowser>(),[filter,setFilter]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[history,setHistory]=useState<{paths:string[];index:number}>({paths:[],index:-1});
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
  }catch(cause){if(request===revision.current&&!controller.signal.aborted&&mounted.current)setError(message(cause));}
  finally{if(request===revision.current&&mounted.current)setLoading(false);}
 };
 useEffect(()=>{mounted.current=true;void browse('');return()=>{mounted.current=false;++revision.current;pending.current?.abort();};},[]);
 const edit=(value:string)=>{++revision.current;pending.current?.abort();setLoading(false);setAddress(value);setError('');};
 const open=async()=>{
  if(busy||loading||!address.trim())return;setBusy(true);setError('');
  try{
   const selected=location?.path===address?location:await browse(address);if(!selected||!mounted.current)return;
   const request=revision.current,workspace=await api.selectWorkspace(selected.path);if(mounted.current&&request===revision.current)onPick(workspace);
  }catch(cause){if(mounted.current)setError(message(cause));}finally{if(mounted.current)setBusy(false);}
 };
 const navigate=(path:string)=>{if(!busy)void browse(path);};
 const entries=location?.entries.filter(entry=>entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))??[];
 const crumbs=location?breadcrumbs(location.path):[];
 return<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><section className="dialog workspace-dialog" role="dialog" aria-modal="true" aria-label="选择工作区" onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();onClose();}}}>
  <header><h2>选择工作区</h2><button type="button" className="icon-button" aria-label="关闭" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  <p className="subtle workspace-intro">浏览运行这台服务的计算机。原文件直接打开，生成的文件保存在所选工作区。</p>
  <div className="workspace-navigation"><div className="directory-history">
   <button type="button" className="icon-button" aria-label="后退" data-tooltip="返回上次浏览的目录" disabled={busy||history.index<=0} onClick={()=>void browse(history.paths[history.index-1]!,history.index-1)}><ArrowLeft size={16}/></button>
   <button type="button" className="icon-button" aria-label="前进" data-tooltip="前往下一条浏览记录" disabled={busy||history.index>=history.paths.length-1} onClick={()=>void browse(history.paths[history.index+1]!,history.index+1)}><ArrowRight size={16}/></button>
   <button type="button" className="icon-button" aria-label="上一级" data-tooltip="浏览当前目录的上一级" disabled={busy||!location?.parent} onClick={()=>{if(location?.parent)navigate(location.parent);}}><ArrowUp size={16}/></button>
  </div><div className="path-entry"><label className="sr-only" htmlFor="workspace-path">工作区目录</label><input id="workspace-path" autoFocus placeholder="输入目录路径" value={address} disabled={busy} onChange={event=>edit(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void browse(address);}}}/><button type="button" disabled={busy} onClick={()=>void browse(address)}>浏览目录</button></div></div>
  {location&&<nav className="directory-breadcrumbs" aria-label="目录路径">{crumbs.map((crumb,index)=><span key={crumb.path}>{index>0&&<ChevronRight size={12} aria-hidden="true"/>}<button type="button" disabled={busy} aria-current={index===crumbs.length-1?'location':undefined} title={crumb.path} onClick={()=>navigate(crumb.path)}>{crumb.name}</button></span>)}</nav>}
  <div className="directory-explorer"><aside className="directory-locations" aria-label="常用位置与目录树">
   {recent.length>0&&<div className="directory-recents"><h3>最近工作区</h3>{recent.slice(0,5).map(workspace=><button type="button" key={workspace.id} disabled={busy} title={workspace.root} onClick={()=>navigate(workspace.root)}><Folder size={15}/><span>{workspace.name}</span></button>)}</div>}
   <h3>本机目录</h3><ul className="directory-tree">{location?.roots.map(root=><DirectoryTreeNode key={root.path} entry={root} current={location.path} onNavigate={navigate}/>)}</ul>
  </aside><div className="directory-contents" aria-busy={loading}>
   <div className="directory-filter"><Search size={15} aria-hidden="true"/><input aria-label="筛选当前目录" placeholder="筛选当前目录" disabled={busy} value={filter} onChange={event=>setFilter(event.target.value)}/></div>
   <div className="directory-list">{loading?<div className="directory-loading" role="status">正在读取目录…</div>:entries.length?entries.map(entry=><button type="button" key={entry.path} aria-label={'进入目录：'+entry.name} disabled={busy} onClick={()=>navigate(entry.path)}><Folder size={17}/><span>{entry.name}</span><ChevronRight size={14} aria-hidden="true"/></button>):<p className="directory-empty">{filter?'没有匹配的子目录，试试其他名称。':'此目录没有子目录，可以直接打开此工作区。'}</p>}</div>
  </div></div>
  <div className="workspace-selection"><span>所选目录</span><output role="status" aria-label="所选目录">{location?.path??'请选择目录'}</output>{location&&address!==location.path&&<small>地址已修改，打开时将先验证新目录。</small>}</div>
  {error&&<p className="error" role="alert">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" data-tooltip="将当前目录作为阅读工作区，原文件保留在原位置" disabled={busy||loading||!address.trim()} onClick={()=>void open()}>{busy?'正在打开…':'打开此工作区'}</button></footer>
 </section></div>;
}
