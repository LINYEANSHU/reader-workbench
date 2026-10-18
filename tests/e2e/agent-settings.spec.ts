import {selectControlValue} from './controls.js';
import {createServer} from 'node:http';import {resolve} from 'node:path';import {mkdir} from 'node:fs/promises';
import {test,expect,model,openWorkspace} from './fixtures.js';

test('edits preferences, uses provider-default output and displays the fixed input capacity',async({page,host,root})=>{
 const requests:any[]=[];
 const remote=createServer(async(req,res)=>{
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[{"id":"browser-protocol-test"}]}');return;}
  let body='';for await(const part of req)body+=part;requests.push(JSON.parse(body));
  res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:{content:'已应用偏好'},finish_reason:'stop'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage:{prompt_tokens:128,completion_tokens:16,prompt_cache_hit_tokens:64,prompt_cache_miss_tokens:64}})+'\n\ndata: [DONE]\n\n');
 });
 await new Promise<void>(done=>remote.listen(0,'127.0.0.1',done));
 try{
  await model(host,root,'http://127.0.0.1:'+(remote.address() as {port:number}).port);await openWorkspace(page,host,root);
  await page.getByRole('button',{name:'打开设置',exact:true}).click();const dialog=page.getByRole('dialog',{name:'设置',exact:true});
  await dialog.getByRole('button',{name:'提示词与个性化',exact:true}).click();
  await selectControlValue(dialog.getByRole('combobox',{name:'预设风格',exact:true}),'candid');
  await expect(dialog.getByRole('textbox',{name:'系统提示词',exact:true})).toContainText('坦诚');
  await dialog.getByRole('textbox',{name:'个性化提示词',exact:true}).fill('请用中文先讲原理，再举例。');
  await selectControlValue(dialog.getByRole('combobox',{name:'亲切程度',exact:true}),'enhanced');
  await selectControlValue(dialog.getByRole('combobox',{name:'热情程度',exact:true}),'reduced');
  await selectControlValue(dialog.getByRole('combobox',{name:'视觉与布局效果',exact:true}),'concise');
  await selectControlValue(dialog.getByRole('combobox',{name:'标题与列表',exact:true}),'concise');
  await dialog.getByRole('button',{name:'保存提示词',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('已保存');
  const evidence=resolve('docs/evidence/2026-10-16/model-output-policy');await mkdir(evidence,{recursive:true});
  for(const width of [1600,320]){
   await page.setViewportSize({width,height:1000});
   expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
   await page.screenshot({path:resolve(evidence,'prompt-settings-'+width+'.png')});
  }
  await page.setViewportSize({width:1600,height:1000});
  await dialog.getByRole('button',{name:'模型连接',exact:true}).click();await dialog.getByText('模型配置',{exact:true}).click();
  await expect(dialog.getByRole('spinbutton',{name:'输出上限',exact:true})).toHaveCount(0);await expect(dialog.getByRole('spinbutton',{name:'上下文容量',exact:true})).toHaveCount(0);await expect(dialog).toContainText('输入上限固定为 1,000,000 token');await expect(dialog).toContainText('输出长度使用模型供应商默认值');
  for(const width of [1600,320]){
   await page.setViewportSize({width,height:1000});expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
   await dialog.getByText('输入上限固定为 1,000,000 token。输出长度使用模型供应商默认值。',{exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:resolve(evidence,'model-settings-'+width+'.png')});
  }
  await page.setViewportSize({width:1600,height:1000});
  await dialog.getByRole('button',{name:'关闭设置',exact:true}).click();
  const main=page.getByRole('region',{name:'主对话',exact:true});await main.getByRole('textbox',{name:'主对话输入'}).fill('测试个性化');await main.getByRole('button',{name:'发送',exact:true}).click();
  await expect(main.getByText('已应用偏好',{exact:true})).toBeVisible();
  const stats=page.getByRole('region',{name:'工作区统计',exact:true});await expect(stats).toContainText('144 tok');await expect(stats).toContainText('缓存命中 50.0%');
  await stats.getByRole('button',{name:'工作区用量与上下文详情'}).click();await expect(stats).toContainText('1,000,000');await expect(stats).toContainText('未缓存输入');
  expect(requests.at(-1).messages[0].content).toContain('请用中文先讲原理，再举例。');expect(requests.at(-1).messages[0].content).toContain('简洁');expect(requests.at(-1)).not.toHaveProperty('max_tokens');
  await page.screenshot({path:resolve(evidence,'session-statistics.png')});
  await page.reload();await page.getByRole('button',{name:'打开设置',exact:true}).click();await page.getByRole('button',{name:'提示词与个性化',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'个性化提示词',exact:true})).toHaveValue('请用中文先讲原理，再举例。');
 }finally{remote.closeAllConnections();await new Promise<void>(done=>remote.close(()=>done()));}
});

test('does not show one model’s live context under a different selected model',async({page,host,root})=>{
 let release!:()=>void;const gate=new Promise<void>(done=>release=done);let submitted=false;
 const remote=createServer(async(req,res)=>{
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');return;}
  for await(const _part of req){}submitted=true;res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({choices:[{delta:{content:'正在回答'},finish_reason:null}]})+'\n\n');await gate;res.end('data: '+JSON.stringify({choices:[{delta:{content:'完成'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
 });
 await new Promise<void>(done=>remote.listen(0,'127.0.0.1',done));
 try{
  const workspace=await model(host,root,'http://127.0.0.1:'+(remote.address() as {port:number}).port);
  const saved=(await host.models.listModelSettings(workspace.id))[0];await host.models.saveModelSettings(workspace.id,{...saved,id:'second',credentialRef:'',model:'different-model',capabilities:{...saved.capabilities,contextWindow:128000}},'second-test-key');
  await openWorkspace(page,host,root);const main=page.getByRole('region',{name:'主对话',exact:true});
  await main.getByRole('textbox',{name:'主对话输入'}).fill('保持流式回答');await main.getByRole('button',{name:'发送',exact:true}).click();await expect.poll(()=>submitted).toBe(true);
  await selectControlValue(main.getByRole('combobox',{name:'模型',exact:true}),'second');
  const stats=page.getByRole('region',{name:'工作区统计',exact:true});await stats.getByRole('button',{name:'工作区用量与上下文详情'}).click();
  const context=stats.getByRole('region',{name:'主对话上下文'});await expect(context).toContainText('different-model');await expect(context).toContainText('1,000,000');await expect(context).toContainText('固定输入上限');
  release();await expect(main.getByText('正在回答完成',{exact:true})).toBeVisible();
 }finally{release();remote.closeAllConnections();await new Promise<void>(done=>remote.close(()=>done()));}
});
