import {useEffect,useState} from 'react';import {BookOpen,FolderOpen,LoaderCircle} from 'lucide-react';
import type {Workspace} from '../../../packages/contracts/src/workspaces.js';import {api,message} from './api/client.js';import {WorkspacePicker} from './workspaces/WorkspacePicker.js';import {Workbench} from './workbench/Workbench.js';
export function App(){
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[demo,setDemo]=useState(false),[workspace,setWorkspace]=useState<Workspace|null>(null),[picker,setPicker]=useState(false),[recent,setRecent]=useState<Workspace[]>([]);
 useEffect(()=>{let active=true;(async()=>{
  const code=new URLSearchParams(location.hash.slice(1)).get('bootstrap');history.replaceState(null,'',location.pathname+location.search);if(code){const response=await fetch('/api/v1/auth/bootstrap',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({code})});if(!response.ok)throw new Error('启动链接已失效，请使用命令行提供的新启动链接。');}
  const config=await api.config(),recent=await api.workspaces();if(!active)return;setDemo(config.demo);setRecent(recent);const previous=localStorage.getItem('reader:last-workspace');const chosen=recent.find(w=>w.id===previous)||recent.find(w=>w.root===config.workspace);if(chosen){try{const selected=await api.selectWorkspace(chosen.root);if(active)setWorkspace(selected);}catch{}}
  if(active)setReady(true);
 })().catch(error=>{if(active){setError(message(error));setReady(true);}});return()=>{active=false;};},[]);
 const choose=(selected:Workspace)=>{localStorage.setItem('reader:last-workspace',selected.id);setRecent(previous=>[selected,...previous.filter(w=>w.id!==selected.id)]);setWorkspace(selected);setPicker(false);};
 if(!ready)return<div className="connecting"><LoaderCircle className="spin"/>正在连接本地阅读服务…</div>;
 return<>{workspace&&!error?<Workbench key={workspace.id} workspace={workspace} demo={demo} onChooseWorkspace={()=>setPicker(true)}/>:<main className="welcome"><div className="brand"><BookOpen size={22}/><strong>Reader Workbench</strong><span>阅读工作台</span></div><div className="welcome-card"><BookOpen size={48} strokeWidth={1.3}/><p className="eyebrow">你的文档，两个思考空间</p><h1>把阅读留在眼前。<br/>让追问随时发生。</h1><p className="subtle">打开一个工作区，将原文、主对话和临时追问放在同一张工作台上。</p>{error?<p role="alert" className="error">{error}</p>:<button className="primary large" onClick={()=>setPicker(true)}><FolderOpen size={18}/>选择工作区</button>}<small>Markdown · Word · PowerPoint · PDF</small></div><footer>文件保存在你的工作区 · 通过你配置的模型连接阅读</footer></main>}
 {picker&&<WorkspacePicker recent={recent} onPick={choose} onClose={()=>setPicker(false)}/>}</>;
}
