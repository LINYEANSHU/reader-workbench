import {useEffect,useState} from 'react';import {BookOpen,Folder,FolderOpen,FileText,ChevronRight,ChevronDown,Plus,Upload,Settings2,Archive,ArchiveRestore} from 'lucide-react';
import type {Workspace,FileEntry} from '../../../../packages/contracts/src/workspaces.js';import type {SessionRecord} from '../../../../packages/contracts/src/sessions.js';import type {SessionId} from '../../../../packages/contracts/src/ids.js';import {api,message} from '../api/client.js';
function FileTree({workspace,path='',onOpen,revision}:{workspace:Workspace;path?:string;onOpen:(path:string)=>void;revision:number}){
 const [files,setFiles]=useState<FileEntry[]>([]),[expanded,setExpanded]=useState<Record<string,boolean>>({}),[error,setError]=useState('');useEffect(()=>{let active=true;api.files(workspace.id,path).then(files=>{if(active)setFiles(files);}).catch(error=>{if(active)setError(message(error));});return()=>{active=false;};},[workspace.id,path,revision]);
 return<div className="file-tree">{error&&<span className="error">{error}</span>}{files.map(file=><div key={file.relativePath}><button title={file.relativePath} aria-label={file.name} onClick={()=>file.kind==='directory'?setExpanded(value=>({...value,[file.relativePath]:!value[file.relativePath]})):onOpen(file.relativePath)}>{file.kind==='directory'?<>{expanded[file.relativePath]?<ChevronDown size={12}/>:<ChevronRight size={12}/>}<Folder size={15}/></>:<><span className="tree-indent"/><FileText size={15}/></>}<span>{file.name}</span></button>{file.kind==='directory'&&expanded[file.relativePath]&&<div className="tree-children"><FileTree workspace={workspace} path={file.relativePath} onOpen={onOpen} revision={revision}/></div>}</div>)}</div>;
}
export function WorkspaceSidebar({workspace,sessions,selected,archiving,onArchive,onSession,onNew,onOpen,onWorkspace,onSettings,onImport,revision}:{workspace:Workspace;sessions:SessionRecord[];selected:string|null;archiving:string|null;onArchive:(id:SessionId,archived:boolean)=>void;onSession:(id:SessionId)=>void;onNew:()=>void;onOpen:(path:string)=>void;onWorkspace:()=>void;onSettings:()=>void;onImport:(file:File)=>void;revision:number}){
 const main=sessions.filter(session=>session.kind==='main'),active=main.filter(session=>!session.archivedAt),archived=main.filter(session=>session.archivedAt);
 return<aside className="workspace-sidebar" aria-label="工作区侧栏" data-ui>
  <div className="brand"><BookOpen size={21}/><strong>Reader Workbench</strong></div>
  <button className="new-session" data-tooltip="新建主对话，保留当前对话与阅读记录" onClick={onNew}><Plus size={16}/>新建主对话</button>
  <button className="sidebar-action" data-tooltip="选择或打开本机的阅读工作区" onClick={onWorkspace}><FolderOpen size={16}/>切换工作区</button>
  <div className="sidebar-scroll">
   <div className="sidebar-section-title">主对话<span>{active.length}</span></div>
   <div className="session-list">{active.map(session=><div key={session.id} className={'session-row'+(selected===session.id?' selected':'')}>
    <button className="session-open" aria-current={selected===session.id?'true':undefined} title={session.title??'阅读会话'} onClick={()=>onSession(session.id)}>{session.title??'阅读会话'}</button>
    <button className="session-archive" aria-label={'归档主对话：'+(session.title??'阅读会话')} data-tooltip="归档此主对话，保留历史，可随时恢复" disabled={Boolean(archiving)} onClick={()=>onArchive(session.id,true)}><Archive size={15}/></button>
   </div>)}</div>
   {archived.length>0&&<details className="archived-sessions"><summary data-tooltip="查看并恢复已归档的主对话"><Archive size={14}/><span>已归档</span><span>{archived.length}</span></summary><div className="session-list">{archived.map(session=><div className="session-row archived" key={session.id}>
    <span className="archived-title" title={session.title??'阅读会话'}>{session.title??'阅读会话'}</span>
    <button className="session-archive" aria-label={'恢复主对话：'+(session.title??'阅读会话')} data-tooltip="恢复此主对话并继续阅读" disabled={Boolean(archiving)} onClick={()=>onArchive(session.id,false)}><ArchiveRestore size={15}/></button>
   </div>)}</div></details>}
   <div className="sidebar-section-title" title={workspace.root}><span>{workspace.name}</span><label className="icon-button" data-tooltip="导入文件到当前工作区并打开"><Upload size={14}/><input type="file" className="sr-only" aria-label="导入文件" onChange={event=>{if(event.target.files?.[0])onImport(event.target.files[0]);event.target.value='';}}/></label></div>
   <FileTree workspace={workspace} onOpen={onOpen} revision={revision}/>
  </div>
  <button className="sidebar-action settings-button" data-tooltip="管理全局模型连接、提示词和工作台设置" onClick={onSettings}><Settings2 size={16}/>设置</button>
  <div className="workspace-path" title={workspace.root}>{workspace.root}</div>
 </aside>;
}