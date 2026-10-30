import {useEffect,useState} from 'react';import {BookOpen,Folder,FolderOpen,FileText,FileImage,FileCode,FileSpreadsheet,FileHeadphone,FileVideo,Presentation,ChevronRight,ChevronDown,ChevronsUpDown,Plus,Upload,Settings2,Archive,ArchiveRestore,type LucideIcon} from 'lucide-react';
import type {Workspace,FileEntry} from '../../../../packages/contracts/src/workspaces.js';import type {SessionRecord} from '../../../../packages/contracts/src/sessions.js';import type {SessionId} from '../../../../packages/contracts/src/ids.js';import {api,message,errorText} from '../api/client.js';
import type {SourceAnchor} from '../../../../packages/contracts/src/documents.js';
import {WorkspaceMemoryPanel} from '../workbench/WorkspaceMemoryPanel.js';
import {t,useLocale} from '../i18n/index.js';
const fileKinds:Array<[string,LucideIcon,RegExp]>=[['pdf',FileText,/^pdf$/],['document',FileText,/^(docx?|odt|rtf)$/],['slides',Presentation,/^(pptx?|odp|key)$/],['sheet',FileSpreadsheet,/^(xlsx?|ods|csv|tsv)$/],['image',FileImage,/^(png|jpe?g|gif|webp|bmp|svg)$/],['audio',FileHeadphone,/^(wav|mp3|m4a|ogg|flac)$/],['video',FileVideo,/^(mp4|webm|mov|mkv)$/],['code',FileCode,/^(m?[jt]sx?|cjs|py|json|ya?ml|toml|html?|css|sh|ps1)$/]];
function FileIcon({name}:{name:string}){const extension=name.includes('.')?name.split('.').at(-1)!.toLowerCase():'',[kind,Icon]=fileKinds.find(([,,pattern])=>pattern.test(extension))??['text',FileText];return<Icon size={15} className={'file-icon '+kind}/>;}
function FileTree({workspace,path='',onOpen,revision}:{workspace:Workspace;path?:string;onOpen:(path:string)=>void;revision:number}){
 useLocale();
 const [files,setFiles]=useState<FileEntry[]>([]),[expanded,setExpanded]=useState<Record<string,boolean>>({}),[error,setError]=useState('');useEffect(()=>{let active=true;api.files(workspace.id,path).then(files=>{if(active)setFiles(files);}).catch(error=>{if(active)setError(errorText(error));});return()=>{active=false;};},[workspace.id,path,revision]);
 return<div className="file-tree">{error&&<span className="error">{message(error)}</span>}{files.map(file=><div key={file.relativePath}><button title={file.relativePath} aria-label={file.name} onClick={()=>file.kind==='directory'?setExpanded(value=>({...value,[file.relativePath]:!value[file.relativePath]})):onOpen(file.relativePath)}>{file.kind==='directory'?<>{expanded[file.relativePath]?<ChevronDown size={12}/>:<ChevronRight size={12}/>}<Folder size={15}/></>:<><span className="tree-indent"/><FileIcon name={file.name}/></>}<span>{file.name}</span></button>{file.kind==='directory'&&expanded[file.relativePath]&&<div className="tree-children"><FileTree workspace={workspace} path={file.relativePath} onOpen={onOpen} revision={revision}/></div>}</div>)}</div>;
}
export function WorkspaceSidebar({workspace,sessions,selected,archiving,onArchive,onSession,onNew,onOpen,onWorkspace,onSettings,onImport,revision,onReference}:{workspace:Workspace;sessions:SessionRecord[];selected:string|null;archiving:string|null;onArchive:(id:SessionId,archived:boolean)=>void;onSession:(id:SessionId)=>void;onNew:()=>void;onOpen:(path:string)=>void;onWorkspace:()=>void;onSettings:()=>void;onImport:(file:File)=>void;revision:number;onReference?:(anchor:SourceAnchor)=>void}){
 useLocale();
 const main=sessions.filter(session=>session.kind==='main'),active=main.filter(session=>!session.archivedAt),archived=main.filter(session=>session.archivedAt);
 return<aside className="workspace-sidebar" aria-label={t('工作区侧栏','Workspace sidebar')} data-ui>
  <div className="brand"><span className="brand-seal"><BookOpen size={15}/></span><strong>Reader Workbench</strong></div>
  <button className="workspace-card" aria-label={t('切换工作区','Switch workspace')} data-tooltip={t('选择或打开本机的阅读工作区','Choose or open a local reading workspace')} onClick={onWorkspace}><FolderOpen size={17}/><span className="workspace-card-text"><strong>{workspace.name}</strong><span className="workspace-path" title={workspace.root}>{workspace.root}</span></span><ChevronsUpDown size={14}/></button>
  <button className="new-session" data-tooltip={t('新建主对话，保留当前对话与阅读记录','Start a main chat while keeping your current chats and reading history')} onClick={onNew}><Plus size={15}/>{t('新建主对话','New main chat')}</button>
  <div className="sidebar-scroll">
   <div className="sidebar-section-title">{t('主对话','Main chats')}<span>{active.length}</span></div>
   <div className="session-list">{active.map(session=><div key={session.id} className={'session-row'+(selected===session.id?' selected':'')}>
    <button className="session-open" aria-current={selected===session.id?'true':undefined} title={session.title??t('阅读会话','Reading session')} onClick={()=>onSession(session.id)}>{session.title??t('阅读会话','Reading session')}</button>
    <button className="session-archive" aria-label={t('归档主对话：{title}','Archive main chat: {title}',{title:session.title??t('阅读会话','Reading session')})} data-tooltip={t('归档此主对话，保留历史，可随时恢复','Archive this main chat and keep its history for later restoration')} disabled={Boolean(archiving)} onClick={()=>onArchive(session.id,true)}><Archive size={15}/></button>
   </div>)}</div>
   {archived.length>0&&<details className="archived-sessions"><summary data-tooltip={t('查看并恢复已归档的主对话','View and restore archived main chats')}><Archive size={14}/><span>{t('已归档','Archived')}</span><span>{archived.length}</span></summary><div className="session-list">{archived.map(session=><div className="session-row archived" key={session.id}>
    <span className="archived-title" title={session.title??t('阅读会话','Reading session')}>{session.title??t('阅读会话','Reading session')}</span>
    <button className="session-archive" aria-label={t('恢复主对话：{title}','Restore main chat: {title}',{title:session.title??t('阅读会话','Reading session')})} data-tooltip={t('恢复此主对话并继续阅读','Restore this main chat and continue reading')} disabled={Boolean(archiving)} onClick={()=>onArchive(session.id,false)}><ArchiveRestore size={15}/></button>
   </div>)}</div></details>}
   <div className="sidebar-section-title" title={workspace.root}><span>{t('文件','Files')}</span><label className="icon-button" data-tooltip={t('导入文件到当前工作区并打开','Import a file into this workspace and open it')}><Upload size={14}/><input type="file" className="sr-only" aria-label={t('导入文件','Import file')} onChange={event=>{if(event.target.files?.[0])onImport(event.target.files[0]);event.target.value='';}}/></label></div>
   <FileTree workspace={workspace} onOpen={onOpen} revision={revision}/>
   <WorkspaceMemoryPanel key={workspace.id} workspaceId={workspace.id} onOpen={onReference}/>
  </div>
  <button className="sidebar-action settings-button" data-tooltip={t('管理全局模型连接、提示词和工作台设置','Manage global model connections, prompts and workbench settings')} onClick={onSettings}><Settings2 size={16}/>{t('设置','Settings')}</button>
 </aside>;
}
