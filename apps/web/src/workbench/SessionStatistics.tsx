import {useEffect,useState} from 'react';import {Database,Layers,ChartNoAxesCombined} from 'lucide-react';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import type {ContextUsage,MaskedModelSettings,SessionUsageSummary} from '../../../../packages/contracts/src/models.js';
import {api} from '../api/client.js';import '../styles/agent-preferences.css';
const numbers=new Intl.NumberFormat('zh-CN');
const compact=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1});
export function SessionStatistics({workspaceId,sessionId,model,liveContext,busy,revision}:{workspaceId:WorkspaceId;sessionId:SessionId;model:MaskedModelSettings;liveContext?:ContextUsage;busy:boolean;revision:string}){
 const [usage,setUsage]=useState<SessionUsageSummary|null>(null),[error,setError]=useState(false),[expanded,setExpanded]=useState(false);
 useEffect(()=>{
  if(model.id==='demo')return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   try{if(document.visibilityState!=='hidden'){const result=await api.sessionUsage(workspaceId,sessionId,model.id,controller.signal);if(!controller.signal.aborted){setUsage(result);setError(false);}}}catch{if(!controller.signal.aborted)setError(true);}
   finally{if(!controller.signal.aborted)timer=setTimeout(()=>void load(),busy?2000:5000);}
  };void load();return()=>{controller.abort();clearTimeout(timer);};
 },[workspaceId,sessionId,model.id,busy,revision]);
 const context=busy&&liveContext?liveContext:usage?.context??liveContext;
 const unknown=Boolean(usage?.requests&&!usage.reportedRequests);
 const total=model.id==='demo'?'演示':!usage?'读取中':unknown?'用量未回传':(usage.missingUsageRequests?'≥ ':'')+compact.format(usage.totalTokens)+' tok';
 const hit=usage?.cacheHitRate!=null?(usage.cacheHitRate*100).toFixed(1)+'%':'未回传';
 const occupancy=context?(context.usedTokens/context.limit*100).toFixed(1)+'%':'—';
 return<section className="session-statistics" aria-label="会话统计">
  <button type="button" className="session-statistics-toggle" aria-label="会话用量与上下文详情" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
   <span><Database size={13} aria-hidden="true"/>{total}</span><span><ChartNoAxesCombined size={13} aria-hidden="true"/>缓存命中 {hit}</span><span><Layers size={13} aria-hidden="true"/>{context?.estimated?'约 ':''}{occupancy}</span>
  </button>
  {expanded&&<div className="session-statistics-details">
   <p>本会话 · 当前模型 {model.model}</p>
   <p>累计输入 {numbers.format(usage?.inputTokens??0)} · 输出 {numbers.format(usage?.outputTokens??0)} · 合计 {unknown?'未回传':numbers.format(usage?.totalTokens??0)} token</p>
   <p>缓存读取 {usage?.cacheReportedRequests?numbers.format(usage.cachedInputTokens??0):'未回传'} · 未缓存输入 {usage?.cacheReportedRequests?numbers.format(usage.uncachedInputTokens??0):'未回传'}</p>
   <p>当前输入 {context?numbers.format(context.usedTokens):'尚未发送'} / {numbers.format(context?.limit??model.capabilities.contextWindow)} token{context?' · '+(context.estimated?'本地估算':'服务回传')+' · '+(context.capacitySource==='application'?'固定输入上限':context.capacitySource==='service'?'服务端容量':'历史配置容量'):' · 固定输入上限'}</p>
   <p>输出长度由供应商默认决定 · 输入达到上限的 80% 时尝试 AI 压缩</p>
   {Boolean(usage?.missingUsageRequests)&&<p>有 {usage!.missingUsageRequests} 次请求未回传用量，累计值只包含已回传部分。</p>}
   {usage&&usage.requests>(usage.cacheReportedRequests??0)&&<p>缓存命中率只统计回传缓存字段的请求。</p>}
   <p>{usage?.trackedSince?'自 '+new Date(usage.trackedSince).toLocaleString('zh-CN',{hour12:false})+' 起统计。':'首次请求后开始记录。'}此前用量无法追溯。</p>
   <p>包含此会话的工具续答、文档预读与 AI 压缩请求；累计用量保存在本地。上下文占用反映最近一次回答请求。</p>
  </div>}
  {error&&<p className="session-statistics-error" role="status">统计读取失败，正在重试。</p>}
 </section>;
}
