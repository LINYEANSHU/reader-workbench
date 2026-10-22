import {useEffect,useState} from 'react';import {Database,Layers,ChartNoAxesCombined} from 'lucide-react';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import type {ContextUsage,MaskedModelSettings,SessionUsageSummary} from '../../../../packages/contracts/src/models.js';
import {api} from '../api/client.js';import '../styles/agent-preferences.css';
import {t,useLocale,getIntlLocale} from '../i18n/index.js';
export function SessionStatistics({workspaceId,sessionId,model,liveContext,busy,revision}:{workspaceId:WorkspaceId;sessionId:SessionId;model:MaskedModelSettings;liveContext?:ContextUsage;busy:boolean;revision:string}){
 useLocale();
 const numbers=new Intl.NumberFormat(getIntlLocale()),compact=new Intl.NumberFormat(getIntlLocale(),{notation:'compact',maximumFractionDigits:1});
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
 const total=model.id==='demo'?t('演示','Demo'):!usage?t('读取中','Loading'):unknown?t('用量未回传','Usage not reported'):(usage.missingUsageRequests?'≥ ':'')+compact.format(usage.totalTokens)+' tok';
 const hit=usage?.cacheHitRate!=null?(usage.cacheHitRate*100).toFixed(1)+'%':t('未回传','Not reported');
 const occupancy=context?(context.usedTokens/context.limit*100).toFixed(1)+'%':'—';
 return<section className="session-statistics" aria-label={t('会话统计','Session statistics')}>
  <button type="button" className="session-statistics-toggle" aria-label={t('会话用量与上下文详情','Session usage and context details')} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
   <span><Database size={13} aria-hidden="true"/>{total}</span><span><ChartNoAxesCombined size={13} aria-hidden="true"/>{t('缓存命中 {hit}','Cache hit {hit}',{hit})}</span><span><Layers size={13} aria-hidden="true"/>{context?.estimated?t('约 ','Approx. '):''}{occupancy}</span>
  </button>
  {expanded&&<div className="session-statistics-details">
   <p>{t('本会话 · 当前模型 {model}','This session · Current model {model}',{model:model.model})}</p>
   <p>{t('累计输入 {input} · 输出 {output} · 合计 {total} token','Total input {input} · Output {output} · Total {total} tokens',{input:numbers.format(usage?.inputTokens??0),output:numbers.format(usage?.outputTokens??0),total:unknown?t('未回传','Not reported'):numbers.format(usage?.totalTokens??0)})}</p>
   <p>{t('缓存读取 {cached} · 未缓存输入 {uncached}','Cached input {cached} · Uncached input {uncached}',{cached:usage?.cacheReportedRequests?numbers.format(usage.cachedInputTokens??0):t('未回传','Not reported'),uncached:usage?.cacheReportedRequests?numbers.format(usage.uncachedInputTokens??0):t('未回传','Not reported')})}</p>
   <p>{t('当前输入 {used} / {limit} token','Current input {used} / {limit} tokens',{used:context?numbers.format(context.usedTokens):t('尚未发送','Not sent yet'),limit:numbers.format(context?.limit??model.capabilities.contextWindow)})}{context?' · '+(context.estimated?t('本地估算','Local estimate'):t('服务回传','Service report'))+' · '+(context.capacitySource==='application'?t('固定输入上限','Fixed input limit'):context.capacitySource==='service'?t('服务端容量','Service capacity'):t('历史配置容量','Previous configured capacity')):t(' · 固定输入上限',' · Fixed input limit')}</p>
   <p>{t('输出长度由供应商默认决定 · 输入达到上限的 80% 时尝试 AI 压缩','Output length uses the provider default · AI compression is attempted at 80% of the input limit')}</p>
   {Boolean(usage?.missingUsageRequests)&&<p>{t('有 {count} 次请求未回传用量，累计值只包含已回传部分。','{count} requests did not report usage. Totals include reported usage only.',{count:numbers.format(usage!.missingUsageRequests)})}</p>}
   {usage&&usage.requests>(usage.cacheReportedRequests??0)&&<p>{t('缓存命中率只统计回传缓存字段的请求。','The cache hit rate includes only requests that report cache usage.')}</p>}
   <p>{usage?.trackedSince?t('自 {date} 起统计。','Tracked since {date}.',{date:new Date(usage.trackedSince).toLocaleString(getIntlLocale(),{hour12:false})}):t('首次请求后开始记录。','Tracking starts with the first request.')}{t('此前用量无法追溯。',' Earlier usage cannot be recovered.')}</p>
   <p>{t('包含此会话的工具续答、文档预读与 AI 压缩请求；累计用量保存在本地。上下文占用反映最近一次回答请求。','Includes tool continuations, document pre-reading and AI compression for this session. Cumulative usage is saved locally. Context occupancy reflects the most recent answer request.')}</p>
  </div>}
  {error&&<p className="session-statistics-error" role="status">{t('统计读取失败，正在重试。','Could not load statistics. Retrying…')}</p>}
 </section>;
}
