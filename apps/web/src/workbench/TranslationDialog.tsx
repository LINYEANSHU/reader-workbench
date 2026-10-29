import {useCallback,useEffect,useRef,useState} from 'react';
import {Languages,X,Download,FileText} from 'lucide-react';
import type {DocumentRecord} from '../../../../packages/contracts/src/documents.js';
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
import {localizeMessage,t,useLocale} from '../i18n/index.js';
import '../styles/document-processing.css';

export function TranslationDialog({document,sessionId,models,providerId,plan,onClose,onSaved}:{document:DocumentRecord;sessionId:SessionId;models:MaskedModelSettings[];providerId:string;plan:DocumentReadingPlan|null;onClose:()=>void;onSaved:(document:DocumentRecord)=>void}){
 useLocale();
 const [engine,setEngine]=useState('local'),[localStatus,setLocalStatus]=useState<{ready:boolean;error?:unknown}|null>(null);
 const [provider,setProvider]=useState(providerId),[language,setLanguage]=useState('简体中文'),[scope,setScope]=useState<'all'|'custom'>(plan&&plan.pages.length<document.pageCount?'custom':'all'),[range,setRange]=useState(plan?.pages.join(',')??''),[task,setTask]=useState<DocumentProcessingTask|null>(null),[error,setError]=useState<unknown>(''),[submitting,setSubmitting]=useState(false),[saving,setSaving]=useState(false),[opening,setOpening]=useState(false);
 useEffect(()=>{let active=true;void api.request<{ready:boolean;error?:string}>('/translation/local').then(value=>{if(active)setLocalStatus(value);}).catch(cause=>{if(active)setLocalStatus({ready:false,error:cause});});return()=>{active=false;};},[]);
 const root=useRef<HTMLElement>(null),current=useRef(task),starting=useRef(false),mounted=useRef(true);current.current=task;
 const busy=submitting||Boolean(task&&['queued','running'].includes(task.status));
 const close=useCallback(()=>{if(!saving)onClose();},[saving,onClose]);useDialogFocus(root,close,saving);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const value=current.current;if(value&&['queued','running'].includes(value.status))void documentProcessing.cancel(value).catch(()=>{});};},[]);
 useEffect(()=>{
  if(!task||!['queued','running'].includes(task.status))return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{try{const next=await documentProcessing.get(task,controller.signal);if(!controller.signal.aborted)setTask(next);if(['queued','running'].includes(next.status)&&!controller.signal.aborted)timer=setTimeout(()=>void poll(),600);}catch(cause){if(!controller.signal.aborted){setError(cause);timer=setTimeout(()=>void poll(),1800);}}};
  timer=setTimeout(()=>void poll(),200);return()=>{controller.abort();clearTimeout(timer);};
 },[task?.id,task?.status]);
 let pages:number[]|undefined,validation='';
 try{if(scope==='custom')pages=parsePageRanges(range,document.pageCount);}catch(cause){validation=message(cause);}
 const local=engine==='local',selectedModel=models.find(model=>model.id===provider),configured=local?Boolean(localStatus?.ready):Boolean(selectedModel&&(selectedModel.hasKey||selectedModel.id==='demo'));
 const start=async()=>{
  if(starting.current||busy||validation||!configured)return;
  starting.current=true;setSubmitting(true);setError('');
  try{const value=await documentProcessing.start({document:{workspaceId:document.workspaceId,documentId:document.documentId,version:document.version},sessionId,providerId:local?'core.local-translation':provider,processorId:'document-translation.translate',targetLanguage:language,...(pages?{pages}:{})});if(mounted.current)setTask(value);else void documentProcessing.cancel(value).catch(()=>{});}
  catch(cause){if(mounted.current)setError(cause);}finally{starting.current=false;if(mounted.current)setSubmitting(false);}
 };
 const cancel=async()=>{if(!task)return;setError('');try{setTask(await documentProcessing.cancel(task));}catch(cause){setError(cause);}};
 const save=async()=>{if(!task)return;setSaving(true);setError('');try{const artifact=await documentProcessing.save(task);setTask(previous=>previous?{...previous,status:'saved',artifact}:previous);}catch(cause){setError(cause);}finally{setSaving(false);}};
 const open=async()=>{if(!task?.artifact)return;setOpening(true);setError('');try{const record=await api.openArtifact(document.workspaceId,task.artifact.id);onSaved(record);onClose();}catch(cause){setError(cause);}finally{setOpening(false);}};
 const complete=Boolean(task&&['ready','saved'].includes(task.status)),isPdf=task?.preview?.mime==='application/pdf';
 return<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
  <section ref={root} tabIndex={-1} className="dialog translation-dialog" role="dialog" aria-modal="true" aria-labelledby="translation-title">
   <header><div className="processing-dialog-title"><Languages size={19}/><h2 id="translation-title">{t('翻译文档','Translate document')}</h2></div><button className="icon-button" aria-label={busy?t('关闭并取消翻译','Close and cancel translation'):t('关闭翻译','Close translation')} disabled={saving} onClick={close}><X size={18}/></button></header>
   <div className="translation-dialog-body">
    <p className="processing-file-name">{document.relativePath.split(/[\\/]/).at(-1)}<span>{t('通过文档翻译插件处理 · 原文件保留','Processed by the document translation plugin · Original file retained')}</span></p>
    {!task&&<>
     <div className="translation-fields"><label>{t('翻译方式','Translation method')}<SelectControl aria-label={t('翻译方式','Translation method')} value={engine} options={[{value:'local',label:t('本地离线翻译','Local offline translation'),description:t('中英互译 · 无需 API','Chinese ↔ English · No API required')},{value:'model',label:t('已配置的 AI 模型','Configured AI model')}]} onChange={value=>{setEngine(value);if(value==='local'&&!['简体中文','English'].includes(language))setLanguage('简体中文');}} disabled={submitting}/></label><label>{t('目标语言','Target language')}<SelectControl aria-label={t('目标语言','Target language')} value={language} onChange={setLanguage} options={(local?['简体中文','English']:['简体中文','English','日本語','Deutsch']).map(value=>({value,label:value==='简体中文'?t('简体中文','Simplified Chinese'):value==='日本語'?t('日本語','Japanese'):value==='Deutsch'?t('Deutsch','German'):value}))} disabled={submitting}/></label>{!local&&<label>{t('翻译模型','Translation model')}<SelectControl aria-label={t('翻译模型','Translation model')} value={provider} options={models.map(model=>({value:model.id,label:model.model,description:model.id,disabled:!model.hasKey&&model.id!=='demo'}))} onChange={setProvider} searchable disabled={submitting}/></label>}</div>
     {local&&<p className="subtle" role="status">{localStatus===null?t('正在检查本地翻译引擎…','Checking the local translation engine…'):localStatus.ready?t('离线引擎已就绪。正文仅在本机处理，无需配置模型。','The offline engine is ready. Text is processed on this device; no model setup is needed.'):message(localStatus.error)}</p>}
     <fieldset className="translation-scope" disabled={submitting}><legend className="sr-only">{t('翻译范围','Translation scope')}</legend><label><input type="radio" name="translation-scope" checked={scope==='all'} onChange={()=>setScope('all')}/>{t('全部正文','All text')}</label>{document.pageCount>1&&<label><input type="radio" name="translation-scope" checked={scope==='custom'} onChange={()=>setScope('custom')}/>{t('指定页码','Specific pages')}</label>}</fieldset>
     {scope==='custom'&&<label className="range-field">{t('翻译页码','Pages to translate')}<input aria-label={t('翻译页码','Pages to translate')} value={range} placeholder={t('例如：2-3,10-15','For example: 2-3,10-15')} onChange={event=>setRange(event.target.value)}/></label>}
     <p className="translation-source-note">{t('提取原文文字后翻译，代码、公式和图内小字保留。PDF / PPT 输出按原文页与译文页配对的对照 PDF。没有文本层的扫描页暂不支持。','Translation uses extracted source text and preserves code, formulas, and small text inside figures. PDF / PPT output pairs each source page with a translated page in a comparison PDF. Scanned pages without a text layer are not supported yet.')}</p>
     {!local&&!configured&&<p className="error">{t('请先在设置中配置一个可用模型，或切换到本地离线翻译。','Configure an available model in settings, or switch to local offline translation.')}</p>}
    </>}
    {task&&<div className="translation-progress" aria-live="polite"><span>{task.status==='cancelled'?t('翻译已取消','Translation cancelled'):task.status==='failed'?t('翻译未完成','Translation incomplete'):task.status==='saved'?t('翻译与保存已完成','Translation completed and saved'):task.progress.label?localizeMessage(task.progress.label):t('准备翻译','Preparing translation')}</span>{busy&&<progress aria-label={t('翻译进度','Translation progress')} max={Math.max(1,task.progress.total)} value={task.progress.completed}/>}<span>{task.progress.total>0?t('{completed} / {total} 个文字块',task.progress.total===1?'{completed} / {total} text block':'{completed} / {total} text blocks',{completed:task.progress.completed,total:task.progress.total}):t('正在准备正文与来源','Preparing text and sources')}</span></div>}
    {Boolean(validation||error||task?.error)&&<p className="error" role="alert">{message(validation||error||task?.error?.message)}</p>}
    {Boolean(task?.warnings.length)&&<details className="translation-warnings" open><summary>{t('翻译提示（{count}）','Translation notes ({count})',{count:task!.warnings.length})}</summary><ul className="translation-warning-list">{task!.warnings.map((warning,index)=><li key={index}>{localizeMessage(warning)}</li>)}</ul></details>}
    {complete&&task&&<section className="translation-preview" aria-label={t('译文预览','Translation preview')}><h3>{t('译文预览','Translation preview')}</h3>{isPdf?<iframe title={t('译文 PDF 预览','Translated PDF preview')} src={documentProcessing.previewUrl(task)}/>:task.previewText?<MarkdownViewer text={task.previewText}/>:<p>{t('译文文件已生成，可下载检查后另存。','The translated file is ready. Download it for review, then save a separate copy.')}</p>}<a href={documentProcessing.previewUrl(task)} download={task.preview?.name}><Download size={13}/>{t('下载预览文件','Download preview file')}</a></section>}
    {task?.artifact&&<div className="translation-saved" role="status"><FileText size={15}/><span>{t('译文已保存：{path}','Translation saved: {path}',{path:task.artifact.relativePath})}</span><button disabled={opening} onClick={()=>void open()}>{opening?t('正在打开…','Opening…'):t('打开译文','Open translation')}</button></div>}
   </div>
   <footer><button disabled={saving} onClick={close}>{busy?t('关闭并取消','Close and cancel'):t('关闭','Close')}</button>{busy&&task?<button disabled={saving} onClick={()=>void cancel()}>{t('取消任务','Cancel task')}</button>:task?.status==='ready'?<button className="primary" disabled={saving} onClick={()=>void save()}>{saving?t('保存中…','Saving…'):t('另存译文','Save translation as')}</button>:!task?<button className="primary" disabled={submitting||!configured||Boolean(validation)} onClick={()=>void start()}>{submitting?t('提交中…','Submitting…'):t('开始翻译','Start translation')}</button>:['failed','cancelled'].includes(task.status)?<button onClick={()=>{setTask(null);setError('');}}>{t('重新选择范围','Choose scope again')}</button>:null}</footer>
  </section>
 </div>;
}
