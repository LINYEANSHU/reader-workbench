import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {mkdir as makeDirectory} from 'node:fs/promises';
import {test,expect,model,openWorkspace} from './fixtures.js';

test('shows missing usage honestly for the selected chat model and separates saved connections',async({page,host,root,modelUrl})=>{
 const workspace=await model(host,root,modelUrl);
 const first=(await host.models.listModelSettings(workspace.id))[0]!;
 await host.models.saveModelSettings(workspace.id,{...first,id:'second',credentialRef:'',model:'second-model'},'second-browser-key');
 await openWorkspace(page,host,root);
 const main=page.getByRole('region',{name:'主对话',exact:true});
 await main.getByRole('combobox',{name:'模型'}).selectOption('second');
 await main.getByRole('textbox',{name:'主对话输入'}).fill('用量测试');
 await main.getByRole('button',{name:'发送',exact:true}).click();
 await expect(main.getByText('解释：用量测试。独立回答。',{exact:true})).toBeVisible();
 await expect(main.locator('.working')).toHaveCount(0);
 await page.getByRole('button',{name:'打开设置',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'设置',exact:true});
 await expect(dialog.getByRole('combobox',{name:'连接配置'})).toHaveValue('second');
 const usage=dialog.getByRole('region',{name:'模型 Token 用量'});
 await expect(usage).toContainText('second-model');
 await expect(usage).toContainText('1 次未回传');
 await expect(usage.getByText('未回传',{exact:true})).toHaveCount(3);
 await dialog.getByRole('combobox',{name:'连接配置'}).selectOption('test');
 await expect(usage).toContainText('尚无请求');
 await expect(usage).toContainText('browser-protocol-test');
 await expect(usage).not.toContainText('1 次未回传');
 await expect(dialog.getByRole('textbox',{name:'模型名称',exact:true})).not.toBeVisible();
 await dialog.locator('summary').filter({hasText:'模型配置'}).click();
 await dialog.getByRole('textbox',{name:'模型名称',exact:true}).fill('unsaved-model');
 await expect(usage).toHaveCount(0);
 await expect(dialog).toContainText('模型连接有未保存的修改');
 await dialog.getByRole('textbox',{name:'模型名称',exact:true}).fill('browser-protocol-test');
 await expect(usage).toContainText('尚无请求');
});

test('refreshes reported input/output totals and fits settings in desktop and narrow themes',async({page,host,root})=>{
 const remote=createServer(async(req,res)=>{
  for await(const _part of req){}
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.end('data: '+JSON.stringify({choices:[{delta:{content:'已统计'},finish_reason:'stop'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage:{prompt_tokens:1234,completion_tokens:56}})+'\n\ndata: [DONE]\n\n');
 });
 await new Promise<void>(done=>remote.listen(0,'127.0.0.1',done));
 try{
  const workspace=await model(host,root,'http://127.0.0.1:'+(remote.address() as {port:number}).port);
  await openWorkspace(page,host,root);
  await page.getByRole('button',{name:'打开设置',exact:true}).click();
  const usage=page.getByRole('region',{name:'模型 Token 用量'});
  await expect(usage).toContainText('尚无请求');
  const provider=host.capabilities.get(workspace.id,'model','test');
  for await(const _event of provider.generate({messages:[{role:'user',content:'count'}],tools:[],maxOutputTokens:128},new AbortController().signal)){}
  await usage.getByRole('button',{name:'刷新用量'}).click();
  await expect(usage.locator('dd')).toHaveText(['1,234','56','1,290']);
  await expect(usage).toContainText('最近一次：输入 1,234 · 输出 56 · 合计 1,290');
  const evidence=resolve('docs/evidence/2026-10-14/model-usage');await makeDirectory(evidence,{recursive:true});
  for(const theme of ['light','graphite','ink']){
   await page.evaluate(value=>document.documentElement.dataset.appearance=value,theme);
   for(const width of [1600,320]){
    await page.setViewportSize({width,height:1000});
    await usage.scrollIntoViewIfNeeded();
    const bounds=(await usage.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    expect(await usage.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    await page.screenshot({path:resolve(evidence,theme+'-'+width+'.png')});
   }
  }
  await page.route('**/settings/models/test/usage',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'temporarily unavailable'}})}));
  await usage.getByRole('button',{name:'刷新用量'}).click();
  await expect(usage.getByRole('alert')).toContainText('用量读取失败');
  await expect(usage.locator('dd')).toHaveText(['1,234','56','1,290']);
  await page.unroute('**/settings/models/test/usage');
  await usage.getByRole('button',{name:'刷新用量'}).click();
  await expect(usage.getByRole('alert')).toHaveCount(0);
 }finally{remote.closeAllConnections();await new Promise<void>(done=>remote.close(()=>done()));}
});
