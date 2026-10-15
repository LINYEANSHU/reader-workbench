import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import type {WorkspaceId} from '../../../../packages/contracts/src/ids.js';
import type {MaskedModelSettings,ModelUsageSummary} from '../../../../packages/contracts/src/models.js';
import {api,message} from '../api/client.js';
import '../styles/model-usage.css';

const number=new Intl.NumberFormat('zh-CN');
const date=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false});

export function ModelUsageStatus({workspaceId,model}:{workspaceId:WorkspaceId;model:MaskedModelSettings}){
 const [usage,setUsage]=useState<ModelUsageSummary|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{
   if(document.visibilityState==='hidden'){timer=setTimeout(()=>void load(),5000);return;}
   setBusy(true);
   try{
    const result=await api.modelUsage(workspaceId,model.id,controller.signal);
    if(!controller.signal.aborted){setUsage(result);setError('');}
   }catch(cause){if(!controller.signal.aborted)setError(message(cause));}
   finally{if(!controller.signal.aborted){setBusy(false);timer=setTimeout(()=>void load(),5000);}}
  };
  void load();
  return()=>{controller.abort();clearTimeout(timer);};
 },[workspaceId,model.id,refresh]);
 const unknown=usage!==null&&usage.requests>0&&usage.reportedRequests===0;
 const count=(value:number)=>unknown?'未回传':number.format(value);
 const last=usage?.lastRequest;
 return<section className="model-usage" aria-label="模型 Token 用量" aria-busy={busy}>
  <div className="model-usage-heading"><div><h3>Token 用量</h3><span>{model.model}</span></div><button type="button" disabled={busy} onClick={()=>setRefresh(value=>value+1)} aria-label="刷新用量"><RefreshCw size={14} aria-hidden="true"/>刷新</button></div>
  {usage?<>
   <dl className="model-usage-totals">
    <div><dt>累计输入</dt><dd>{count(usage.inputTokens)}</dd></div>
    <div><dt>累计输出</dt><dd>{count(usage.outputTokens)}</dd></div>
    <div><dt>累计总量</dt><dd>{count(usage.totalTokens)}</dd></div>
   </dl>
   <p className="model-usage-coverage" role="status">{usage.requests?`${number.format(usage.requests)} 次请求 · ${number.format(usage.reportedRequests)} 次回传 · ${number.format(usage.missingUsageRequests)} 次未回传`:'尚无请求'}</p>
   <p>缓存命中率：{usage.cacheHitRate!=null?(usage.cacheHitRate*100).toFixed(1)+'%':'未回传'} · 缓存读取 {usage.cacheReportedRequests?number.format(usage.cachedInputTokens??0):'未回传'} · 未缓存输入 {usage.cacheReportedRequests?number.format(usage.uncachedInputTokens??0):'未回传'}</p>
   {last&&<p className="model-usage-last">{last.totalTokens===null?'最近一次：服务未回传用量，无法确定 token 数。':`最近一次：输入 ${number.format(last.inputTokens!)} · 输出 ${number.format(last.outputTokens!)} · 合计 ${number.format(last.totalTokens)}`}<small>{date(last.at)} · {last.status==='completed'?'已完成':last.status==='cancelled'?'已取消':'未完成'}</small></p>}
   {usage.missingUsageRequests>0&&<p className="model-usage-warning">累计值仅包含已回传的用量。服务未提供统计或请求中断时，实际消耗可能高于已记录值。</p>}
   <p className="model-usage-scope">本工作区{usage.trackedSince?'自 '+date(usage.trackedSince)+' 起累计':'从首次请求开始累计'} · 单位：token</p>
  </>:!error&&<p role="status">正在读取用量…</p>}
  {error&&<p className="error" role="alert">用量读取失败：{error}。可点击刷新重试。</p>}
  <details className="model-usage-help"><summary>统计范围与 token 含义</summary><p>输入是发送给模型的完整内容，包括问题、系统提示、历史对话、文档、图像和工具结果。输出是模型生成的内容；思考内容如何计入，以服务回传口径为准。</p><p>包含此功能启用后的主对话、临时追问、工具续答和文档预读。此前用量无法追溯；累计记录保存在本地工作区，重启后保留。账户余额与剩余额度需要服务商另提供查询接口。</p></details>
 </section>;
}
