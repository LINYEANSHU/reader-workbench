import {useState} from 'react';
import {ArrowUp,Square,Brain} from 'lucide-react';
import type {MaskedModelSettings} from '../../../../packages/contracts/src/models.js';
import type {SelectionContext,Attachment} from '../../../../packages/contracts/src/documents.js';
import {SelectionPreview} from '../selection/SelectionPreview.js';
import {AttachmentPreview} from '../capture/CapturePreview.js';
import {VoiceInput} from '../voice/VoiceInput.js';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import {getSliderEffortLevels,resolveReasoningEffort} from './reasoningEffort.js';
import {ReasoningEffortPicker} from './ReasoningEffortPicker.js';
import {SelectControl} from '../components/SelectControl.js';
import {t,useLocale} from '../i18n/index.js';

interface ComposerProps{
 workspaceId:WorkspaceId;sessionId:SessionId;voiceEnabled:boolean;attachments:Attachment[];onRemoveAttachment:(id:string)=>void;selection?:SelectionContext;onRemoveSelection:()=>void;kind:'main'|'temporary';value:string;onChange:(text:string)=>void;onSubmit:()=>Promise<void>;onCancel:()=>Promise<void>;busy:boolean;models:MaskedModelSettings[];provider:string;onProvider:(value:string)=>void;effort:string;onEffort:(value:string)=>void;onSettings:()=>void;pending:boolean;onRetry:()=>Promise<void>;allowArtifactWrites:boolean;onArtifactWrites:(allowed:boolean)=>void
}

export function Composer({workspaceId,sessionId,voiceEnabled,selection,onRemoveSelection,kind,value,onChange,onSubmit,onCancel,busy,models,provider,onProvider,effort,onEffort,onSettings,attachments,onRemoveAttachment,pending,onRetry,allowArtifactWrites,onArtifactWrites}:ComposerProps){
 useLocale();
 const effortNames:Record<string,string>={none:t('关闭','Off'),low:t('轻度','Low'),medium:t('中等','Medium'),high:t('深入','High'),max:t('最高','Maximum')};
 const [submitting,setSubmitting]=useState(false);
 const profile=models.find(model=>model.id===provider);
 const disabled=!profile||(!profile.hasKey&&profile.id!=='demo');
 const supportedEfforts=profile?.capabilities.reasoningEfforts??[];
 const sliderEfforts=getSliderEffortLevels(supportedEfforts);
 const selectedEffort=resolveReasoningEffort(supportedEfforts,effort,profile?.capabilities.defaultReasoningEffort);
 const submit=async()=>{
  if(!value.trim()||busy||submitting||disabled)return;
  setSubmitting(true);
  try{await onSubmit();}finally{setSubmitting(false);}
 };

 return<div className="composer-wrap">
  {pending&&<div className="pending-submission" role="status">{t('上次提交尚未确认，可安全重试。','Your last submission is unconfirmed. You can safely retry.')}<button disabled={submitting||busy} onClick={async()=>{setSubmitting(true);try{await onRetry();}finally{setSubmitting(false);}}}>{t('重试提交','Retry submission')}</button></div>}
  {disabled&&<button className="configure-model" onClick={onSettings}>{t('请先配置模型连接','Configure a model connection first')}</button>}
  <div className="composer">
   <AttachmentPreview attachments={attachments} onRemove={onRemoveAttachment}/>
   {selection&&<SelectionPreview selection={selection} onRemove={onRemoveSelection}/>}
   <textarea aria-label={kind==='main'?t('主对话输入','Main chat input'):t('临时对话输入','Temporary chat input')} placeholder={kind==='main'?t('一起梳理这份文档…','Let’s work through this document…'):t('随时追问，不打断主对话…','Ask a quick question alongside your main chat…')} value={value} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}}/>
   {kind==='temporary'&&<label className="artifact-permission"><input type="checkbox" aria-label={t('本次允许生成文件','Allow file generation for this request')} checked={allowArtifactWrites} disabled={busy||submitting||pending} onChange={event=>onArtifactWrites(event.target.checked)}/>{t('本次允许生成文件','Allow file generation for this request')}</label>}
   <div className="composer-actions">
    <div className="model-select" data-tooltip={t('选择此对话使用的模型；所有工作区共用已保存的连接','Choose a model for this chat; saved connections are shared across workspaces')}><SelectControl aria-label={t('模型','Model')} value={provider} options={[{value:"",label:t('选择模型','Choose model'),disabled:true},...models.map(model=>({value:model.id,label:model.model}))]} onChange={onProvider} searchable/></div>
    {sliderEfforts.length>1&&<ReasoningEffortPicker key={provider} levels={sliderEfforts} value={selectedEffort} onChange={onEffort} kind={kind}/>}
    {sliderEfforts.length===1&&<div className="effort-select effort-single"><Brain size={13} aria-hidden="true"/><output aria-label={t('思考强度','Reasoning effort')}>{sliderEfforts[0]}</output></div>}
    {!sliderEfforts.length&&supportedEfforts.length>0&&<label className="effort-select effort-fallback"><Brain size={13} aria-hidden="true"/><select aria-label={t('思考强度','Reasoning effort')} value={selectedEffort} onChange={event=>onEffort(event.target.value)}>{supportedEfforts.map(level=><option key={level} value={level}>{effortNames[level]??level}</option>)}</select></label>}
    <span className="composer-spacer"/>
    <VoiceInput key={workspaceId+sessionId} workspaceId={workspaceId} sessionId={sessionId} enabled={voiceEnabled} value={value} onChange={onChange}/>
    {busy?<button className="send-button stop" aria-label={t('取消回答','Cancel response')} onClick={()=>void onCancel()}><Square size={13} fill="currentColor"/></button>:<button className="send-button" aria-label={t('发送','Send')} disabled={disabled||!value.trim()||submitting} onClick={()=>void submit()}><ArrowUp size={17}/></button>}
   </div>
  </div>
  <div className="composer-hint">{kind==='temporary'?t('Enter 发送 · Shift + Enter 换行 · 继承最新完成的主对话','Enter to send · Shift + Enter for a new line · Uses the latest completed main chat'):t('Enter 发送 · Shift + Enter 换行','Enter to send · Shift + Enter for a new line')}</div>
 </div>;
}
