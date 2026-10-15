import {useState} from 'react';
import {ArrowUp,Square,Brain,ChevronDown} from 'lucide-react';
import type {MaskedModelSettings} from '../../../../packages/contracts/src/models.js';
import type {SelectionContext,Attachment} from '../../../../packages/contracts/src/documents.js';
import {SelectionPreview} from '../selection/SelectionPreview.js';
import {AttachmentPreview} from '../capture/CapturePreview.js';
import {VoiceInput} from '../voice/VoiceInput.js';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import {getSliderEffortLevels,resolveReasoningEffort} from './reasoningEffort.js';
import {ReasoningEffortPicker} from './ReasoningEffortPicker.js';

const effortNames:Record<string,string>={none:'关闭',low:'轻度',medium:'中等',high:'深入',max:'最高'};

interface ComposerProps{
 workspaceId:WorkspaceId;sessionId:SessionId;voiceEnabled:boolean;attachments:Attachment[];onRemoveAttachment:(id:string)=>void;selection?:SelectionContext;onRemoveSelection:()=>void;kind:'main'|'temporary';value:string;onChange:(text:string)=>void;onSubmit:()=>Promise<void>;onCancel:()=>Promise<void>;busy:boolean;models:MaskedModelSettings[];provider:string;onProvider:(value:string)=>void;effort:string;onEffort:(value:string)=>void;onSettings:()=>void;pending:boolean;onRetry:()=>Promise<void>;allowArtifactWrites:boolean;onArtifactWrites:(allowed:boolean)=>void
}

export function Composer({workspaceId,sessionId,voiceEnabled,selection,onRemoveSelection,kind,value,onChange,onSubmit,onCancel,busy,models,provider,onProvider,effort,onEffort,onSettings,attachments,onRemoveAttachment,pending,onRetry,allowArtifactWrites,onArtifactWrites}:ComposerProps){
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
  {pending&&<div className="pending-submission" role="status">上次提交尚未确认，可安全重试。<button disabled={submitting||busy} onClick={async()=>{setSubmitting(true);try{await onRetry();}finally{setSubmitting(false);}}}>重试提交</button></div>}
  {disabled&&<button className="configure-model" onClick={onSettings}>请先配置模型连接</button>}
  <div className="composer">
   <AttachmentPreview attachments={attachments} onRemove={onRemoveAttachment}/>
   {selection&&<SelectionPreview selection={selection} onRemove={onRemoveSelection}/>}
   <textarea aria-label={kind==='main'?'主对话输入':'临时对话输入'} placeholder={kind==='main'?'一起梳理这份文档…':'随时追问，不打断主对话…'} value={value} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}}/>
   {kind==='temporary'&&<label className="artifact-permission"><input type="checkbox" aria-label="本次允许生成文件" checked={allowArtifactWrites} disabled={busy||submitting||pending} onChange={event=>onArtifactWrites(event.target.checked)}/>本次允许生成文件</label>}
   <div className="composer-actions">
    <label className="model-select"><select aria-label="模型" value={provider} onChange={event=>onProvider(event.target.value)}><option value="" disabled>选择模型</option>{models.map(model=><option key={model.id} value={model.id}>{model.model}</option>)}</select><ChevronDown size={12}/></label>
    {sliderEfforts.length>1&&<ReasoningEffortPicker key={provider} levels={sliderEfforts} value={selectedEffort} onChange={onEffort} kind={kind}/>}
    {sliderEfforts.length===1&&<div className="effort-select effort-single"><Brain size={13} aria-hidden="true"/><output aria-label="思考强度">{sliderEfforts[0]}</output></div>}
    {!sliderEfforts.length&&supportedEfforts.length>0&&<label className="effort-select effort-fallback"><Brain size={13} aria-hidden="true"/><select aria-label="思考强度" value={selectedEffort} onChange={event=>onEffort(event.target.value)}>{supportedEfforts.map(level=><option key={level} value={level}>{effortNames[level]??level}</option>)}</select></label>}
    <span className="composer-spacer"/>
    <VoiceInput key={workspaceId+sessionId} workspaceId={workspaceId} sessionId={sessionId} enabled={voiceEnabled} value={value} onChange={onChange}/>
    {busy?<button className="send-button stop" aria-label="取消回答" onClick={()=>void onCancel()}><Square size={13} fill="currentColor"/></button>:<button className="send-button" aria-label="发送" disabled={disabled||!value.trim()||submitting} onClick={()=>void submit()}><ArrowUp size={17}/></button>}
   </div>
  </div>
  <div className="composer-hint">Enter 发送 · Shift + Enter 换行{kind==='temporary'?' · 继承最新完成的主对话':''}</div>
 </div>;
}
