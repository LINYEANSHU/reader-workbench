import {useCallback,useRef,useState} from 'react';
import {BookOpen,X} from 'lucide-react';
import type {DocumentRecord} from '../../../../packages/contracts/src/documents.js';
import {parsePageRanges} from '../../../../packages/contracts/src/reading-plan.js';
import {message} from '../api/client.js';
import {readingPlans,type DocumentReadingPlan} from '../api/reading-plan.js';
import {useDialogFocus} from './useDialogFocus.js';
import '../styles/document-processing.css';

export function ReadingPlanDialog({document,plan,onClose,onSaved}:{document:DocumentRecord;plan:DocumentReadingPlan;onClose:()=>void;onSaved:(plan:DocumentReadingPlan)=>void}){
 const all=plan.pages.length===plan.pageCount;
 const [mode,setMode]=useState<'all'|'first'|'custom'>(all?'all':'custom'),[first,setFirst]=useState(String(Math.min(10,plan.pageCount))),[custom,setCustom]=useState(all?'':plan.pages.join(',')),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const root=useRef<HTMLElement>(null),close=useCallback(()=>{if(!saving)onClose();},[onClose,saving]);
 useDialogFocus(root,close,saving);
 let pages:number[]=[],validation='';
 try{pages=mode==='all'?Array.from({length:plan.pageCount},(_,index)=>index+1):parsePageRanges(mode==='first'?'1-'+first:custom,plan.pageCount);}catch(cause){validation=message(cause);}
 const save=async(onlyOpen=false)=>{
  setSaving(true);setError('');try{onSaved(await readingPlans.save(document,onlyOpen?null:pages));}catch(cause){setError(message(cause));setSaving(false);}
 };
 return<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
  <section ref={root} tabIndex={-1} className="dialog reading-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-plan-title">
   <header><div className="processing-dialog-title"><BookOpen size={19}/><h2 id="reading-plan-title">初次阅读范围</h2></div><button className="icon-button" aria-label="关闭初读范围" disabled={saving} onClick={close}><X size={18}/></button></header>
   <p className="processing-file-name" title={document.relativePath}>{document.relativePath.split(/[\\/]/).at(-1)}<span>{plan.pageCount} 页 · {plan.mode==='visual'?'按页图像阅读':'提取正文文字阅读'}</span></p>
   <p className="subtle">先读需要的部分，之后可以继续补读。保存范围不会调用模型，首次提问时才开始阅读。</p>
   <fieldset disabled={saving} className="reading-plan-options"><legend className="sr-only">阅读哪些页</legend>
    <label className={'reading-plan-option'+(mode==='all'?' selected':'')}><input type="radio" name="initial-reading-mode" checked={mode==='all'} onChange={()=>{setMode('all');setError('');}}/><span>全部页面<small>阅读整份文档，共 {plan.pageCount} 页</small></span></label>
    <label className={'reading-plan-option'+(mode==='first'?' selected':'')}><input type="radio" name="initial-reading-mode" aria-label="前几页" checked={mode==='first'} onChange={()=>{setMode('first');setError('');}}/><span>前几页<small>从第 1 页开始，适合先了解文档结构</small></span></label>
    {mode==='first'&&<label className="range-field">初读页数<input aria-label="初读页数" type="number" min={1} max={plan.pageCount} value={first} onChange={event=>{setFirst(event.target.value);setError('');}}/></label>}
    <label className={'reading-plan-option'+(mode==='custom'?' selected':'')}><input type="radio" name="initial-reading-mode" aria-label="自定义页码" checked={mode==='custom'} onChange={()=>{setMode('custom');setError('');}}/><span>自定义页码<small>支持单页、连续范围及多段组合</small></span></label>
    {mode==='custom'&&<label className="range-field">页码范围<input aria-label="初读页码范围" placeholder="例如：2-3,10-15" value={custom} onChange={event=>{setCustom(event.target.value);setError('');}}/><small>按阅读器显示的页序号填写；重叠页只读取一次。</small></label>}
   </fieldset>
   {validation?<p className="error" role="alert">{validation}</p>:<p className="reading-plan-status" role="status">已选择 {pages.length} / {plan.pageCount} 页{pages.length<plan.pageCount?'，其余页面保留为未读。':'。'}</p>}
   {error&&<p className="error" role="alert">{error}</p>}
   <footer><button disabled={saving} onClick={()=>void save(true)}>仅打开文档</button><button className="primary" disabled={saving||Boolean(validation)||!pages.length} onClick={()=>void save()}>{saving?'保存中…':'保存阅读范围'}</button></footer>
  </section>
 </div>;
}
