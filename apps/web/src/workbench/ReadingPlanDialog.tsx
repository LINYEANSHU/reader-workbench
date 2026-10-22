import {useCallback,useRef,useState} from 'react';
import {BookOpen,X} from 'lucide-react';
import type {DocumentRecord} from '../../../../packages/contracts/src/documents.js';
import {parsePageRanges} from '../../../../packages/contracts/src/reading-plan.js';
import {message} from '../api/client.js';
import {readingPlans,type DocumentReadingPlan} from '../api/reading-plan.js';
import {useDialogFocus} from './useDialogFocus.js';
import {t,useLocale} from '../i18n/index.js';
import '../styles/document-processing.css';

export function ReadingPlanDialog({document,plan,onClose,onSaved}:{document:DocumentRecord;plan:DocumentReadingPlan;onClose:()=>void;onSaved:(plan:DocumentReadingPlan)=>void}){
 useLocale();
 const all=plan.pages.length===plan.pageCount;
 const [mode,setMode]=useState<'all'|'first'|'custom'>(all?'all':'custom'),[first,setFirst]=useState(String(Math.min(10,plan.pageCount))),[custom,setCustom]=useState(all?'':plan.pages.join(',')),[saving,setSaving]=useState(false),[error,setError]=useState<unknown>('');
 const root=useRef<HTMLElement>(null),close=useCallback(()=>{if(!saving)onClose();},[onClose,saving]);
 useDialogFocus(root,close,saving);
 let pages:number[]=[],validation='';
 try{pages=mode==='all'?Array.from({length:plan.pageCount},(_,index)=>index+1):parsePageRanges(mode==='first'?'1-'+first:custom,plan.pageCount);}catch(cause){validation=message(cause);}
 const save=async(onlyOpen=false)=>{
  setSaving(true);setError('');try{onSaved(await readingPlans.save(document,onlyOpen?null:pages));}catch(cause){setError(cause);setSaving(false);}
 };
 return<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
  <section ref={root} tabIndex={-1} className="dialog reading-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-plan-title">
   <header><div className="processing-dialog-title"><BookOpen size={19}/><h2 id="reading-plan-title">{t('初次阅读范围','Initial reading range')}</h2></div><button className="icon-button" aria-label={t('关闭初读范围','Close initial reading range')} disabled={saving} onClick={close}><X size={18}/></button></header>
   <p className="processing-file-name" title={document.relativePath}>{document.relativePath.split(/[\\/]/).at(-1)}<span>{plan.mode==='visual'?t('{count} 页 · 按页图像阅读',plan.pageCount===1?'1 page · Read page image':'{count} pages · Read page images',{count:plan.pageCount}):t('{count} 页 · 提取正文文字阅读',plan.pageCount===1?'1 page · Read extracted text':'{count} pages · Read extracted text',{count:plan.pageCount})}</span></p>
   <p className="subtle">{t('先读需要的部分，之后可以继续补读。保存范围不会调用模型，首次提问时才开始阅读。','Read the parts you need first and add more later. Saving the range does not call a model; reading starts with your first question.')}</p>
   <fieldset disabled={saving} className="reading-plan-options"><legend className="sr-only">{t('阅读哪些页','Pages to read')}</legend>
    <label className={'reading-plan-option'+(mode==='all'?' selected':'')}><input type="radio" name="initial-reading-mode" checked={mode==='all'} onChange={()=>{setMode('all');setError('');}}/><span>{t('全部页面','All pages')}<small>{t('阅读整份文档，共 {count} 页',plan.pageCount===1?'Read the entire document (1 page)':'Read the entire document ({count} pages)',{count:plan.pageCount})}</small></span></label>
    <label className={'reading-plan-option'+(mode==='first'?' selected':'')}><input type="radio" name="initial-reading-mode" aria-label={t('前几页','First pages')} checked={mode==='first'} onChange={()=>{setMode('first');setError('');}}/><span>{t('前几页','First pages')}<small>{t('从第 1 页开始，适合先了解文档结构','Start at page 1 to explore the document structure')}</small></span></label>
    {mode==='first'&&<label className="range-field">{t('初读页数','Number of initial pages')}<input aria-label={t('初读页数','Number of initial pages')} type="number" min={1} max={plan.pageCount} value={first} onChange={event=>{setFirst(event.target.value);setError('');}}/></label>}
    <label className={'reading-plan-option'+(mode==='custom'?' selected':'')}><input type="radio" name="initial-reading-mode" aria-label={t('自定义页码','Custom pages')} checked={mode==='custom'} onChange={()=>{setMode('custom');setError('');}}/><span>{t('自定义页码','Custom pages')}<small>{t('支持单页、连续范围及多段组合','Use individual pages, ranges, or a combination')}</small></span></label>
    {mode==='custom'&&<label className="range-field">{t('页码范围','Page range')}<input aria-label={t('初读页码范围','Initial reading page range')} placeholder={t('例如：2-3,10-15','For example: 2-3,10-15')} value={custom} onChange={event=>{setCustom(event.target.value);setError('');}}/><small>{t('按阅读器显示的页序号填写；重叠页只读取一次。','Use the page numbers shown in the reader; overlapping pages are read once.')}</small></label>}
   </fieldset>
   {validation?<p className="error" role="alert">{validation}</p>:<p className="reading-plan-status" role="status">{pages.length<plan.pageCount?t('已选择 {selected} / {total} 页，其余页面保留为未读。','Selected {selected} / {total} pages; the remaining pages stay unread.',{selected:pages.length,total:plan.pageCount}):t('已选择 {selected} / {total} 页。',plan.pageCount===1?'Selected {selected} / {total} page.':'Selected {selected} / {total} pages.',{selected:pages.length,total:plan.pageCount})}</p>}
   {Boolean(error)&&<p className="error" role="alert">{message(error)}</p>}
   <footer><button disabled={saving} onClick={()=>void save(true)}>{t('仅打开文档','Open document only')}</button><button className="primary" disabled={saving||Boolean(validation)||!pages.length} onClick={()=>void save()}>{saving?t('保存中…','Saving…'):t('保存阅读范围','Save reading range')}</button></footer>
  </section>
 </div>;
}
