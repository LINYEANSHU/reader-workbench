import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {test,expect,model,openWorkspace} from './fixtures.js';

test('keeps totals from all main and temporary chats in one footer and reserves translation',async({page,host,root})=>{
 const remote=createServer(async(req,res)=>{
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');return;}
  let body='';for await(const part of req)body+=part;
  const question=String(JSON.parse(body).messages.at(-1).content);
  const usage=question==='追问统计'?{prompt_tokens:300,completion_tokens:30,prompt_cache_hit_tokens:60,prompt_cache_miss_tokens:240}:question==='历史统计'?{prompt_tokens:60,completion_tokens:10,prompt_cache_hit_tokens:10,prompt_cache_miss_tokens:50}:{prompt_tokens:100,completion_tokens:20,prompt_cache_hit_tokens:50,prompt_cache_miss_tokens:50};
  res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:{content:'已记录'+question},finish_reason:'stop'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage})+'\n\ndata: [DONE]\n\n');
 });
 await new Promise<void>(done=>remote.listen(0,'127.0.0.1',done));
 try{
  const workspace=await model(host,root,'http://127.0.0.1:'+(remote.address() as {port:number}).port);
  await openWorkspace(page,host,root);
  const stats=page.getByRole('region',{name:'工作区统计',exact:true});
  await expect(stats).toContainText('0 tok');
  for(const [name,question] of [['主对话','主统计'],['临时对话','追问统计']]){
   const pane=page.getByRole('region',{name,exact:true});
   await pane.getByRole('textbox',{name:name+'输入'}).fill(question);
   await pane.getByRole('button',{name:'发送',exact:true}).click();
   await expect(pane.getByText('已记录'+question,{exact:true})).toBeVisible();
   await expect(pane.locator('.working')).toHaveCount(0);
  }
  const hidden=await host.sessions.createMain(workspace.id,'历史对话');
  const run=await host.runs.submit({workspaceId:workspace.id,sessionId:hidden.id,question:'历史统计',documents:[],attachmentIds:[],providerId:'test',requestId:randomUUID(),allowArtifactWrites:false},{callerId:'local-owner',transport:'internal'});
  for await(const _event of host.runs.events(workspace.id,run.runId,0,new AbortController().signal)){}
  await expect(stats).toContainText('520 tok');await expect(stats).toContainText('缓存命中 26.1%');
  await expect(page.locator('.chat-pane .session-statistics')).toHaveCount(0);
  expect(await stats.evaluate(node=>Boolean(node.closest('footer.statusbar')))).toBe(true);
  await stats.getByRole('button',{name:'工作区用量与上下文详情'}).click();
  await expect(stats).toContainText('累计输入 460 · 输出 60 · 合计 520 token');
  await expect(stats.getByRole('region',{name:'主对话上下文'})).toContainText('64,000');
  await expect(stats.getByRole('region',{name:'临时对话上下文'})).toContainText('64,000');
  await page.keyboard.press('Escape');
  await expect(stats.getByRole('button',{name:'工作区用量与上下文详情'})).toBeFocused();
  await page.getByRole('button',{name:'新建主对话',exact:true}).click();
  await expect(stats).toContainText('520 tok');
  const translate=page.getByRole('button',{name:'一键翻译（即将推出）',exact:true});
  await expect(translate).toBeVisible();await expect(translate).toBeDisabled();
  const evidence=resolve('docs/evidence/2026-10-15/edithere');await mkdir(evidence,{recursive:true});
  for(const width of [1600,768,320]){
   await page.setViewportSize({width,height:1000});
   if(width<760)await page.getByRole('button',{name:'切换侧栏',exact:true}).click();
   await stats.getByRole('button',{name:'工作区用量与上下文详情'}).click();
   expect(await stats.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
   const details=stats.getByRole('region',{name:'工作区用量详情'}),bounds=(await details.boundingBox())!;
   expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
   await page.screenshot({path:resolve(evidence,'workspace-statistics-'+width+'.png')});
   await page.keyboard.press('Escape');
  }
  await page.route('**/workspaces/*/usage',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'unavailable'}})}));
  await expect(stats).toContainText('统计读取失败');await expect(stats).toContainText('520 tok');
 }finally{remote.closeAllConnections();await new Promise<void>(done=>remote.close(()=>done()));}
});
