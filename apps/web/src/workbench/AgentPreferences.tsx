import {useEffect,useState} from 'react';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import {agentPresets,composeAgentPrompt,defaultAgentSettings,type AgentPreset,type AgentSettings} from '../../../../packages/contracts/src/agent-settings.js';
import {SelectControl} from '../components/SelectControl.js';
import {api,message,errorText} from '../api/client.js';
import {t,useLocale,localizeMessage} from '../i18n/index.js';
import '../styles/agent-preferences.css';

export function AgentPreferences({workspaceId}:{workspaceId:WorkspaceId}){
 useLocale();
 const [settings,setSettings]=useState<AgentSettings>(defaultAgentSettings),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(false);
 useEffect(()=>{const controller=new AbortController();api.agentSettings(workspaceId,controller.signal).then(value=>{setSettings(value);setLoading(false);}).catch(cause=>{if(!controller.signal.aborted){setError(errorText(cause));setLoading(false);}});return()=>controller.abort();},[workspaceId]);
 const patch=(value:Partial<AgentSettings>)=>{setSettings(previous=>({...previous,...value}));setNotice(false);};
 const save=async()=>{setSaving(true);setError('');try{setSettings(await api.saveAgentSettings(workspaceId,settings));setNotice(true);}catch(cause){setError(errorText(cause));}finally{setSaving(false);}};
 const presetNames:Record<AgentPreset,string>={professional:t('专业可靠','Professional'),friendly:t('亲和友善','Friendly'),candid:t('直言不讳','Candid'),efficient:t('高效务实','Efficient')};
 return<div className="settings-body agent-preferences" aria-busy={loading||saving}>
  <p className="subtle">{t('保存在本机 Agent 配置目录，所有工作区的主对话与临时对话共用。表达选项调整 AI 的回答方式。','Saved in this local Agent configuration and shared by main and temporary chats across workspaces. Expression preferences adjust how the AI responds.')}</p>
  <fieldset disabled={loading||saving}>
   <label>{t('预设风格','Preset style')}<SelectControl aria-label={t('预设风格','Preset style')} value={settings.preset} disabled={loading||saving} options={Object.keys(agentPresets).map(id=>({value:id,label:presetNames[id as AgentPreset]}))} onChange={value=>{const preset=value as AgentPreset;patch({preset,systemPrompt:agentPresets[preset].prompt});}}/></label>
   <label>{t('系统提示词','System prompt')}<textarea rows={6} value={settings.systemPrompt} maxLength={16000} onChange={event=>patch({systemPrompt:event.target.value})}/></label>
   <p className="subtle">{t('选择预设会载入对应提示词，可继续编辑。来源核对和工作区权限规则仍会附加到请求中。','Selecting a preset loads its prompt for further editing. Source verification and workspace permission rules are still added to each request.')}</p>
   <label>{t('个性化提示词','Personal prompt')}<textarea rows={3} maxLength={16000} placeholder={t('例如：用中文解释，先讲原理，再举例；公式要写出适用条件。','For example: explain the principle before giving examples, and state when each formula applies.')} value={settings.personalPrompt} onChange={event=>patch({personalPrompt:event.target.value})}/></label>
   <div className="field-grid">
    {([['friendliness',t('亲切程度','Friendliness')],['enthusiasm',t('热情程度','Enthusiasm')]] as const).map(([field,label])=><label key={field}>{label}<SelectControl aria-label={label} value={settings[field]} disabled={loading||saving} options={[{value:"enhanced",label:t('增强','More')},{value:"default",label:t('默认','Default')},{value:"reduced",label:t('减弱','Less')}]} onChange={value=>patch({[field]:value})}/></label>)}
    <label>{t('视觉与布局效果','Visual presentation')}<SelectControl aria-label={t('视觉与布局效果','Visual presentation')} value={settings.visualLayout} disabled={loading||saving} options={[{value:"default",label:t('默认','Default')},{value:"concise",label:t('简洁','Concise')}]} onChange={value=>patch({visualLayout:value as AgentSettings["visualLayout"]})}/></label>
    <label>{t('标题与列表','Headings and lists')}<SelectControl aria-label={t('标题与列表','Headings and lists')} value={settings.headingsLists} disabled={loading||saving} options={[{value:"enhanced",label:t('增强','More')},{value:"default",label:t('默认','Default')},{value:"concise",label:t('简洁','Concise')}]} onChange={value=>patch({headingsLists:value as AgentSettings["headingsLists"]})}/></label>
   </div>
   <details><summary>{t('查看组合后的提示词','View combined prompt')}</summary><textarea aria-label={t('组合提示词预览','Combined prompt preview')} rows={10} readOnly value={composeAgentPrompt(settings)}/></details>
   <div className="agent-preferences-actions"><button type="button" onClick={()=>patch(defaultAgentSettings())}>{t('恢复默认提示词','Restore default prompts')}</button><button type="button" className="primary" disabled={!settings.systemPrompt.trim()} onClick={()=>void save()}>{saving?t('保存中…','Saving…'):t('保存提示词','Save prompts')}</button></div>
  </fieldset>
  {loading&&<p role="status">{t('正在读取提示词…','Loading prompts…')}</p>}{notice&&<p className="success" role="status">{t('提示词已保存，下次提问生效。','Prompts saved. They apply to the next question.')}</p>}{error&&<p className="error" role="alert">{localizeMessage(error)}</p>}
 </div>;
}
