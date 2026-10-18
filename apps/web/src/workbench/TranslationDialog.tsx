import {useCallback,useEffect,useRef,useState} from 'react';
import {Languages,X,Download,FileText} from 'lucide-react';
import type {DocumentRecord,SelectionContext} from '../../../../packages/contracts/src/documents.js';
import type {DocumentProcessingTask} from '../../../../packages/contracts/src/document-processing.js';
import type {SessionId} from '../../../../packages/contracts/src/ids.js';
import type {MaskedModelSettings} from '../../../../packages/contracts/src/models.js';
import {parsePageRanges} from '../../../../packages/contracts/src/reading-plan.js';
import {api,message} from '../api/client.js';
import type {DocumentReadingPlan} from '../api/reading-plan.js';
import {documentProcessing} from '../api/document-processing.js';
import {SelectControl} from '../components/SelectControl.js';
import {MarkdownViewer} from '../documents/MarkdownViewer.js';
import {useDialogFocus} from './useDialogFocus.js';
import '../styles/document-processing.css';

export function TranslationDialog({document,sessionId,models,providerId,plan,selection,onClose,onSaved}:{document:DocumentRecord;sessionId:SessionId;models:MaskedModelSettings[];providerId:string;plan:DocumentReadingPlan|null;selection?:SelectionContext;onClose:()=>void;onSaved:(document:DocumentRecord)=>void}){
 const [engine,setEngine]=useState('local'),[localStatus,setLocalStatus]=useState<{ready:boolean;error?:string}|null>(null);
 const [provider,setProvider]=useState(providerId),[language,setLanguage]=useState('简体中文'),[scope,setScope]=useState<'all'|'custom'|'selection'>(selection?'selection':plan&&plan.pages.length<document.pageCount?'custom':'all'),[range,setRange]=useState(plan?.pages.join(',')??''),[task,setTask]=useState<DocumentProcessingTask|null>(null),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false),[saving,setSaving]=useState(false),[opening,setOpening]=useState(false);
 useEffect(()=>{let active=true;void api.request<{ready:boolean;error?:string}>('/translation/local').then(value=>{if(active)setLocalStatus(value);}).catch(cause=>{if(active)setLocalStatus({ready:false,error:message(cause)});});return()=>{active=false;};},[]);
 const root=useRef<HTMLElement>(null),current=useRef(task),starting=useRef(false),mounted=useRef(true);current.current=task;
 const busy=submitting||Boolean(task&&['queued','running'].includes(task.status));
 const close=useCallback(()=>{if(!saving)onClose();},[saving,onClose]);useDialogFocus(root,close,saving);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const value=current.current;if(value&&['queued','running'].includes(value.status))void documentProcessing.cancel(value).catch(()=>{});};},[]);
 useEffect(()=>{
  if(!task||!['queued','running'].includes(task.status))return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{try{const next=await documentProcessing.get(task,controller.signal);if(!controller.signal.aborted)setTask(next);if(['queued','running'].includes(next.status)&&!controller.signal.aborted)timer=setTimeout(()=>void poll(),600);}catch(cause){if(!controller.signal.aborted){setError(message(cause));timer=setTimeout(()=>void poll(),1800);}}};
  timer=setTimeout(()=>void poll(),200);return()=>{controller.abort();clearTimeout(timer);};
 },[task?.id,task?.status]);
 let pages:number[]|undefined,validation='';
 try{if(scope==='custom')pages=parsePageRanges(range,document.pageCount);else if(scope==='selection'&&selection){const values=selection.anchors.flatMap(anchor=>anchor.location.kind==='page'?[anchor.location.page]:[]);if(values.length)pages=[...new Set(values)];}}catch(cause){validation=message(cause);}
 const local=engine==='local',selectedModel=models.find(model=>model.id===provider),configured=local?Boolean(localStatus?.ready):Boolean(selectedModel&&(selectedModel.hasKey||selectedModel.id==='demo'));
 const start=async()=>{
  if(starting.current||busy||validation||!configured)return;
  starting.current=true;setSubmitting(true);setError('');
  try{const value=await documentProcessing.start({document:{workspaceId:document.workspaceId,documentId:document.documentId,version:document.version},sessionId,providerId:local?'core.local-translation':provider,processorId:'document-translation.translate',targetLanguage:language,...(pages?{pages}:{}),...(scope==='selection'&&selection?{selection}:{})});if(mounted.current)setTask(value);else void documentProcessing.cancel(value).catch(()=>{});}
  catch(cause){if(mounted.current)setError(message(cause));}finally{starting.current=false;if(mounted.current)setSubmitting(false);}
 };
 const cancel=async()=>{if(!task)return;setError('');try{setTask(await documentProcessing.cancel(task));}catch(cause){setError(message(cause));}};
 const save=async()=>{if(!task)return;setSaving(true);setError('');try{const artifact=await documentProcessing.save(task);setTask(previous=>previous?{...previous,status:'saved',artifact}:previous);}catch(cause){setError(message(cause));}finally{setSaving(false);}};
 const open=async()=>{if(!task?.artifact)return;setOpening(true);setError('');try{const record=await api.openArtifact(document.workspaceId,task.artifact.id);onSaved(record);onClose();}catch(cause){setError(message(cause));}finally{setOpening(false);}};
 const complete=Boolean(task&&['ready','saved'].includes(task.status)),isPdf=task?.preview?.mime==='application/pdf';
 return<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
  <section ref={root} tabIndex={-1} className="dialog translation-dialog" role="dialog" aria-modal="true" aria-labelledby="translation-title">
   <header><div className="processing-dialog-title"><Languages size={19}/><h2 id="translation-title">翻译文档</h2></div><button className="icon-button" aria-label={busy?'关闭并取消翻译':'关闭翻译'} disabled={saving} onClick={close}><X size={18}/></button></header>
   <div className="translation-dialog-body">
    <p className="processing-file-name">{document.relativePath.split(/[\\/]/).at(-1)}<span>通过文档翻译插件处理 · 原文件保留</span></p>
    {!task&&<>
     <div className="translation-fields"><label>翻译方式<SelectControl aria-label="翻译方式" value={engine} options={[{value:'local',label:'本地离线翻译',description:'中英互译 · 无需 API'},{value:'model',label:'已配置的 AI 模型'}]} onChange={value=>{setEngine(value);if(value==='local'&&!['简体中文','English'].includes(language))setLanguage('简体中文');}} disabled={submitting}/></label><label>目标语言<SelectControl aria-label="目标语言" value={language} onChange={setLanguage} options={(local?['简体中文','English']:['简体中文','English','日本語','Deutsch']).map(value=>({value,label:value}))} disabled={submitting}/></label>{!local&&<label>翻译模型<SelectControl aria-label="翻译模型" value={provider} options={models.map(model=>({value:model.id,label:model.model,description:model.id,disabled:!model.hasKey&&model.id!=='demo'}))} onChange={setProvider} searchable disabled={submitting}/></label>}</div>
     {local&&<p className="subtle" role="status">{localStatus===null?'正在检查本地翻译引擎…':localStatus.ready?'离线引擎已就绪。正文仅在本机处理，无需配置模型。':localStatus.error}</p>}
     <fieldset className="translation-scope" disabled={submitting}><legend className="sr-only">翻译范围</legend>{selection&&<label><input type="radio" name="translation-scope" checked={scope==='selection'} onChange={()=>setScope('selection')}/>已选文字</label>}<label><input type="radio" name="translation-scope" checked={scope==='all'} onChange={()=>setScope('all')}/>全部正文</label>{document.pageCount>1&&<label><input type="radio" name="translation-scope" checked={scope==='custom'} onChange={()=>setScope('custom')}/>指定页码</label>}</fieldset>
     {scope==='custom'&&<label className="range-field">翻译页码<input aria-label="翻译页码" value={range} placeholder="例如：2-3,10-15" onChange={event=>setRange(event.target.value)}/></label>}
     {scope==='selection'&&selection&&<div className="translation-selection">{selection.text}</div>}
     <p className="translation-source-note">提取原文文字后翻译，代码、公式和图内小字保留。PDF / PPT 输出按原文页与译文页配对的对照 PDF。没有文本层的扫描页暂不支持。</p>
     {!local&&!configured&&<p className="error">请先在设置中配置一个可用模型，或切换到本地离线翻译。</p>}
    </>}
    {task&&<div className="translation-progress" aria-live="polite"><span>{task.status==='cancelled'?'翻译已取消':task.status==='failed'?'翻译未完成':task.status==='saved'?'翻译与保存已完成':task.progress.label||'准备翻译'}</span>{busy&&<progress aria-label="翻译进度" max={Math.max(1,task.progress.total)} value={task.progress.completed}/>}<span>{task.progress.total>0?task.progress.completed+' / '+task.progress.total+' 个文字块':'正在准备正文与来源'}</span></div>}
    {(validation||error||task?.error)&&<p className="error" role="alert">{validation||error||task?.error?.message}</p>}
    {Boolean(task?.warnings.length)&&<details className="translation-warnings" open><summary>翻译提示（{task!.warnings.length}）</summary><ul className="translation-warning-list">{task!.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
    {complete&&task&&<section className="translation-preview" aria-label="译文预览"><h3>译文预览</h3>{isPdf?<iframe title="译文 PDF 预览" src={documentProcessing.previewUrl(task)}/>:task.previewText?<MarkdownViewer text={task.previewText}/>:<p>译文文件已生成，可下载检查后另存。</p>}<a href={documentProcessing.previewUrl(task)} download={task.preview?.name}><Download size={13}/>下载预览文件</a></section>}
    {task?.artifact&&<div className="translation-saved" role="status"><FileText size={15}/><span>译文已保存：{task.artifact.relativePath}</span><button disabled={opening} onClick={()=>void open()}>{opening?'正在打开…':'打开译文'}</button></div>}
   </div>
   <footer><button disabled={saving} onClick={close}>{busy?'关闭并取消':'关闭'}</button>{busy&&task?<button disabled={saving} onClick={()=>void cancel()}>取消任务</button>:task?.status==='ready'?<button className="primary" disabled={saving} onClick={()=>void save()}>{saving?'保存中…':'另存译文'}</button>:!task?<button className="primary" disabled={submitting||!configured||Boolean(validation)} onClick={()=>void start()}>{submitting?'提交中…':'开始翻译'}</button>:['failed','cancelled'].includes(task.status)?<button onClick={()=>{setTask(null);setError('');}}>重新选择范围</button>:null}</footer>
  </section>
 </div>;
}
