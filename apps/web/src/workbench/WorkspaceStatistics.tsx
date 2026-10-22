import {useEffect,useRef,useState} from 'react';
import {ChartNoAxesCombined,Database,Layers} from 'lucide-react';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import type {ContextUsage,MaskedModelSettings,SessionUsageSummary,WorkspaceUsageSummary} from '../../../../packages/contracts/src/models.js';
import {api} from '../api/client.js';
import {t,useLocale,getIntlLocale} from '../i18n/index.js';
import '../styles/workspace-statistics.css';

export type LiveSessionContext={providerId:string;context:ContextUsage};
type ContextTarget={title:string;sessionId:SessionId|null;model:MaskedModelSettings|undefined};
const targetKey=(target:ContextTarget)=>JSON.stringify([target.sessionId,target.model?.id,target.model?.baseUrl,target.model?.model]);

export function WorkspaceStatistics({workspaceId,targets,liveContexts,busy,revision,demo}:{workspaceId:WorkspaceId;targets:ContextTarget[];liveContexts:Record<string,LiveSessionContext>;busy:boolean;revision:string;demo:boolean}){
 useLocale();
 const numbers=new Intl.NumberFormat(getIntlLocale()),compact=new Intl.NumberFormat(getIntlLocale(),{notation:'compact',maximumFractionDigits:1});
 const [usage,setUsage]=useState<WorkspaceUsageSummary|null>(null),[contexts,setContexts]=useState<Record<string,SessionUsageSummary>>({}),[error,setError]=useState(false),[expanded,setExpanded]=useState(false);
 const container=useRef<HTMLElement>(null),button=useRef<HTMLButtonElement>(null);
 const queryKey=JSON.stringify(targets.map(target=>[targetKey(target),target.model?.capabilities.contextWindow]));
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const selected=targets.filter(target=>target.sessionId&&target.model&&target.model.id!=='demo');
  const load=async()=>{
   try{
    if(document.visibilityState==='hidden')return;
    const results=await Promise.allSettled([api.workspaceUsage(workspaceId,controller.signal),...selected.map(target=>api.sessionUsage(workspaceId,target.sessionId!,target.model!.id,controller.signal))]);
    if(controller.signal.aborted)return;
    const total=results[0];if(total.status==='fulfilled')setUsage(total.value);
    setContexts(previous=>{
     const next={...previous};selected.forEach((target,index)=>{const result=results[index+1];if(result.status==='fulfilled')next[targetKey(target)]=result.value as SessionUsageSummary;});return next;
    });
    setError(results.some(result=>result.status==='rejected'));
   }finally{if(!controller.signal.aborted)timer=setTimeout(()=>void load(),busy?2000:5000);}
  };void load();return()=>{controller.abort();clearTimeout(timer);};
 },[workspaceId,queryKey,busy,revision]);
 useEffect(()=>{
  if(!expanded)return;
  const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setExpanded(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false);button.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[expanded]);
 const unknown=Boolean(usage?.requests&&!usage.reportedRequests);
 const total=demo?t('演示','Demo'):!usage?error?t('统计不可用','Statistics unavailable'):t('读取中','Loading'):unknown?t('用量未回传','Usage not reported'):(usage.missingUsageRequests?'≥ ':'')+compact.format(usage.totalTokens)+' tok';
 const hit=usage?.cacheHitRate!=null?(usage.cacheHitRate*100).toFixed(1)+'%':t('未回传','Not reported');
 const contextFor=(target:ContextTarget)=>{
  const live=target.sessionId?liveContexts[target.sessionId]:undefined;
  return live?.providerId===target.model?.id?live?.context:contexts[targetKey(target)]?.context;
 };
 return<section ref={container} className="workspace-statistics" aria-label={t('工作区统计','Workspace statistics')}>
  <button ref={button} type="button" className="workspace-statistics-toggle" aria-label={t('工作区用量与上下文详情','Workspace usage and context details')} aria-expanded={expanded} aria-controls="workspace-usage-details" onClick={()=>setExpanded(value=>!value)}>
   <span>{t('全部对话','All chats')}</span><span><Database size={13} aria-hidden="true"/>{total}</span><span><ChartNoAxesCombined size={13} aria-hidden="true"/>{t('缓存命中 {hit}','Cache hit {hit}',{hit})}</span>
   {targets.map(target=>{const context=contextFor(target);return<span key={target.title}><Layers size={13} aria-hidden="true"/>{target.title} {context?(context.estimated?t('约 ','Approx. '):'')+(context.usedTokens/context.limit*100).toFixed(1)+'%':'—'}</span>;})}
  </button>
  {expanded&&<section id="workspace-usage-details" className="workspace-statistics-details" aria-label={t('工作区用量详情','Workspace usage details')}>
   <h3>{t('工作区全部对话','All workspace chats')}</h3>
   {usage?<>
    <p>{t('累计输入 {input} · 输出 {output} · 合计 {total} token','Total input {input} · Output {output} · Total {total} tokens',{input:unknown?t('未回传','Not reported'):numbers.format(usage.inputTokens),output:unknown?t('未回传','Not reported'):numbers.format(usage.outputTokens),total:unknown?t('未回传','Not reported'):numbers.format(usage.totalTokens)})}</p>
    <p>{t('{requests} 次请求 · {reported} 次回传 · {missing} 次未回传','{requests} requests · {reported} reported · {missing} not reported',{requests:numbers.format(usage.requests),reported:numbers.format(usage.reportedRequests),missing:numbers.format(usage.missingUsageRequests)})}</p>
    <p>{t('缓存读取 {cached} · 未缓存输入 {uncached}','Cached input {cached} · Uncached input {uncached}',{cached:usage.cacheReportedRequests?numbers.format(usage.cachedInputTokens??0):t('未回传','Not reported'),uncached:usage.cacheReportedRequests?numbers.format(usage.uncachedInputTokens??0):t('未回传','Not reported')})}</p>
    {usage.missingUsageRequests>0&&<p className="workspace-statistics-warning">{t('有 {count} 次请求未回传用量，累计值只包含已回传部分。','{count} requests did not report usage. Totals include reported usage only.',{count:numbers.format(usage.missingUsageRequests)})}</p>}
    <p>{t('缓存命中率按已回传缓存字段的输入 token 加权计算。','The cache hit rate is weighted by input tokens from requests that report cache usage.')}</p>
   </>:<p>{error?t('统计读取失败，正在重试。','Could not load statistics. Retrying…'):t('正在读取工作区用量…','Loading workspace usage…')}</p>}
   {targets.map(target=>{const context=contextFor(target);return<section className="workspace-context" key={target.title} aria-label={t('{title}上下文','{title} context',{title:target.title})}>
    <h4>{target.title} · {target.model?.model??t('未配置模型','No model configured')}</h4>
    {target.model?<><p>{t('当前输入 {used} / {limit} token','Current input {used} / {limit} tokens',{used:context?numbers.format(context.usedTokens):t('尚未发送','Not sent yet'),limit:numbers.format(context?.limit??target.model.capabilities.contextWindow)})}{context?' · '+(context.estimated?t('本地估算','Local estimate'):t('服务回传','Service report'))+' · '+(context.capacitySource==='application'?t('固定输入上限','Fixed input limit'):context.capacitySource==='service'?t('服务端容量','Service capacity'):t('历史配置容量','Previous configured capacity')):t(' · 固定输入上限',' · Fixed input limit')}</p><p>{t('输出长度由供应商默认决定 · 输入达到上限的 80% 时尝试 AI 压缩','Output length uses the provider default · AI compression is attempted at 80% of the input limit')}</p></>:<p>{t('配置模型后显示上下文容量。','Configure a model to see its context capacity.')}</p>}
   </section>;})}
   <p>{usage?.trackedSince?t('自 {date} 起统计。','Tracked since {date}.',{date:new Date(usage.trackedSince).toLocaleString(getIntlLocale(),{hour12:false})}):t('首次请求后开始记录。','Tracking starts with the first request.')}{t('此前用量无法追溯。',' Earlier usage cannot be recovered.')}</p>
   <p>{t('包含本工作区全部主对话、临时追问、工具续答、文档预读和 AI 压缩请求，跨模型及历史连接配置累计，重启或清空对话后保留。上下文按当前打开的会话及所选模型分别显示。','Includes every main chat, temporary follow-up, tool continuation, document pre-reading and AI compression request in this workspace, across models and previous connection settings. Totals survive restarts and cleared chats. Context is shown separately for each open session and selected model.')}</p>
  </section>}
  {error&&usage&&<span className="workspace-statistics-warning" role="status">{t('统计读取失败，显示上次结果，正在重试。','Could not load statistics. Showing the last result and retrying…')}</span>}
 </section>;
}
