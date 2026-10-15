import {useEffect,useState} from 'react';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import {agentPresets,composeAgentPrompt,defaultAgentSettings,type AgentPreset,type AgentSettings} from '../../../../packages/contracts/src/agent-settings.js';
import {api,message} from '../api/client.js';
import '../styles/agent-preferences.css';

export function AgentPreferences({workspaceId}:{workspaceId:WorkspaceId}){
 const [settings,setSettings]=useState<AgentSettings>(defaultAgentSettings),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{const controller=new AbortController();api.agentSettings(workspaceId,controller.signal).then(value=>{setSettings(value);setLoading(false);}).catch(cause=>{if(!controller.signal.aborted){setError(message(cause));setLoading(false);}});return()=>controller.abort();},[workspaceId]);
 const patch=(value:Partial<AgentSettings>)=>{setSettings(previous=>({...previous,...value}));setNotice('');};
 const save=async()=>{setSaving(true);setError('');try{setSettings(await api.saveAgentSettings(workspaceId,settings));setNotice('提示词已保存，下次提问生效。');}catch(cause){setError(message(cause));}finally{setSaving(false);}};
 return<div className="settings-body agent-preferences" aria-busy={loading||saving}>
  <p className="subtle">用于本工作区的主对话与临时对话。表达选项调整 AI 的回答方式。</p>
  <fieldset disabled={loading||saving}>
   <label>预设风格<select value={settings.preset} onChange={event=>{const preset=event.target.value as AgentPreset;patch({preset,systemPrompt:agentPresets[preset].prompt});}}>{Object.entries(agentPresets).map(([id,preset])=><option key={id} value={id}>{preset.name}</option>)}</select></label>
   <label>系统提示词<textarea rows={6} value={settings.systemPrompt} maxLength={16000} onChange={event=>patch({systemPrompt:event.target.value})}/></label>
   <p className="subtle">选择预设会载入对应提示词，可继续编辑。来源核对和工作区权限规则仍会附加到请求中。</p>
   <label>个性化提示词<textarea rows={3} maxLength={16000} placeholder="例如：用中文解释，先讲原理，再举例；公式要写出适用条件。" value={settings.personalPrompt} onChange={event=>patch({personalPrompt:event.target.value})}/></label>
   <div className="field-grid">
    {([['friendliness','亲切程度'],['enthusiasm','热情程度']] as const).map(([field,label])=><label key={field}>{label}<select value={settings[field]} onChange={event=>patch({[field]:event.target.value})}><option value="enhanced">增强</option><option value="default">默认</option><option value="reduced">减弱</option></select></label>)}
    <label>视觉与布局效果<select value={settings.visualLayout} onChange={event=>patch({visualLayout:event.target.value as AgentSettings['visualLayout']})}><option value="default">默认</option><option value="concise">简洁</option></select></label>
    <label>标题与列表<select value={settings.headingsLists} onChange={event=>patch({headingsLists:event.target.value as AgentSettings['headingsLists']})}><option value="enhanced">增强</option><option value="default">默认</option><option value="concise">简洁</option></select></label>
   </div>
   <details><summary>查看组合后的提示词</summary><textarea aria-label="组合提示词预览" rows={10} readOnly value={composeAgentPrompt(settings)}/></details>
   <div className="agent-preferences-actions"><button type="button" onClick={()=>patch(defaultAgentSettings())}>恢复默认提示词</button><button type="button" className="primary" disabled={!settings.systemPrompt.trim()} onClick={()=>void save()}>{saving?'保存中…':'保存提示词'}</button></div>
  </fieldset>
  {loading&&<p role="status">正在读取提示词…</p>}{notice&&<p className="success" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
 </div>;
}
