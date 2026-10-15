import {useEffect,useRef,useState} from 'react';
import {ChartNoAxesCombined,Database,Layers} from 'lucide-react';
import type {WorkspaceId,SessionId} from '../../../../packages/contracts/src/ids.js';
import type {ContextUsage,MaskedModelSettings,SessionUsageSummary,WorkspaceUsageSummary} from '../../../../packages/contracts/src/models.js';
import {api} from '../api/client.js';
import '../styles/workspace-statistics.css';

export type LiveSessionContext={providerId:string;context:ContextUsage};
type ContextTarget={title:string;sessionId:SessionId|null;model:MaskedModelSettings|undefined};
const numbers=new Intl.NumberFormat('zh-CN');
const compact=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1});
const targetKey=(target:ContextTarget)=>JSON.stringify([target.sessionId,target.model?.id,target.model?.baseUrl,target.model?.model]);

export function WorkspaceStatistics({workspaceId,targets,liveContexts,busy,revision,demo}:{workspaceId:WorkspaceId;targets:ContextTarget[];liveContexts:Record<string,LiveSessionContext>;busy:boolean;revision:string;demo:boolean}){
 const [usage,setUsage]=useState<WorkspaceUsageSummary|null>(null),[contexts,setContexts]=useState<Record<string,SessionUsageSummary>>({}),[error,setError]=useState(false),[expanded,setExpanded]=useState(false);
 const container=useRef<HTMLElement>(null),button=useRef<HTMLButtonElement>(null);
 const queryKey=JSON.stringify(targets.map(target=>[targetKey(target),target.model?.capabilities.contextWindow,target.model?.capabilities.maxOutputTokens]));
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
 const total=demo?'演示':!usage?error?'统计不可用':'读取中':unknown?'用量未回传':(usage.missingUsageRequests?'≥ ':'')+compact.format(usage.totalTokens)+' tok';
 const hit=usage?.cacheHitRate!=null?(usage.cacheHitRate*100).toFixed(1)+'%':'未回传';
 const contextFor=(target:ContextTarget)=>{
  const live=target.sessionId?liveContexts[target.sessionId]:undefined;
  return live?.providerId===target.model?.id?live?.context:contexts[targetKey(target)]?.context;
 };
 return<section ref={container} className="workspace-statistics" aria-label="工作区统计">
  <button ref={button} type="button" className="workspace-statistics-toggle" aria-label="工作区用量与上下文详情" aria-expanded={expanded} aria-controls="workspace-usage-details" onClick={()=>setExpanded(value=>!value)}>
   <span>全部对话</span><span><Database size={13} aria-hidden="true"/>{total}</span><span><ChartNoAxesCombined size={13} aria-hidden="true"/>缓存命中 {hit}</span>
   {targets.map(target=>{const context=contextFor(target);return<span key={target.title}><Layers size={13} aria-hidden="true"/>{target.title} {context?(context.estimated?'约 ':'')+(context.usedTokens/context.limit*100).toFixed(1)+'%':'—'}</span>;})}
  </button>
  {expanded&&<section id="workspace-usage-details" className="workspace-statistics-details" aria-label="工作区用量详情">
   <h3>工作区全部对话</h3>
   {usage?<>
    <p>累计输入 {unknown?'未回传':numbers.format(usage.inputTokens)} · 输出 {unknown?'未回传':numbers.format(usage.outputTokens)} · 合计 {unknown?'未回传':numbers.format(usage.totalTokens)} token</p>
    <p>{numbers.format(usage.requests)} 次请求 · {numbers.format(usage.reportedRequests)} 次回传 · {numbers.format(usage.missingUsageRequests)} 次未回传</p>
    <p>缓存读取 {usage.cacheReportedRequests?numbers.format(usage.cachedInputTokens??0):'未回传'} · 未缓存输入 {usage.cacheReportedRequests?numbers.format(usage.uncachedInputTokens??0):'未回传'}</p>
    {usage.missingUsageRequests>0&&<p className="workspace-statistics-warning">有 {numbers.format(usage.missingUsageRequests)} 次请求未回传用量，累计值只包含已回传部分。</p>}
    <p>缓存命中率按已回传缓存字段的输入 token 加权计算。</p>
   </>:<p>{error?'统计读取失败，正在重试。':'正在读取工作区用量…'}</p>}
   {targets.map(target=>{const context=contextFor(target);return<section className="workspace-context" key={target.title} aria-label={target.title+'上下文'}>
    <h4>{target.title} · {target.model?.model??'未配置模型'}</h4>
    {target.model?<><p>当前上下文 {context?numbers.format(context.usedTokens):'尚未发送'} / {numbers.format(context?.limit??target.model.capabilities.contextWindow)} token{context?' · '+(context.estimated?'本地估算':'服务回传')+' · '+(context.capacitySource==='service'?'服务端容量':'手填容量'):' · 手填容量'}</p><p>输出预留 {numbers.format(context?.reservedOutputTokens??target.model.capabilities.maxOutputTokens)} token · 上下文达到容量的 80% 时尝试 AI 压缩</p></>:<p>配置模型后显示上下文容量。</p>}
   </section>;})}
   <p>{usage?.trackedSince?'自 '+new Date(usage.trackedSince).toLocaleString('zh-CN',{hour12:false})+' 起统计。':'首次请求后开始记录。'}此前用量无法追溯。</p>
   <p>包含本工作区全部主对话、临时追问、工具续答、文档预读和 AI 压缩请求，跨模型及历史连接配置累计，重启或清空对话后保留。上下文按当前打开的会话及所选模型分别显示。</p>
  </section>}
  {error&&usage&&<span className="workspace-statistics-warning" role="status">统计读取失败，显示上次结果，正在重试。</span>}
 </section>;
}
