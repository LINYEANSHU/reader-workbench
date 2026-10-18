import {selectControlValue} from './controls.js';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {test,expect,model,openWorkspace} from './fixtures.js';
import {CredentialStore} from '../../packages/core/src/runtime/credentials.js';

const evidence=resolve('docs/evidence/2026-10-16/workbench-controls');
test('archives the current main chat, reloads, then restores its completed conversation',async({page,host,root,modelUrl})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root);
 const main=page.getByRole('region',{name:'主对话',exact:true}),sidebar=page.getByRole('complementary',{name:'工作区侧栏'});
 await main.getByRole('textbox',{name:'主对话输入'}).fill('归档后仍需保留的内容');await main.getByRole('button',{name:'发送',exact:true}).click();
 await expect(main.getByText('解释：归档后仍需保留的内容。独立回答。',{exact:true})).toBeVisible();
 await sidebar.getByRole('button',{name:'归档主对话：阅读会话',exact:true}).click();
 await expect(main.getByText('解释：归档后仍需保留的内容。独立回答。',{exact:true})).toHaveCount(0);
 await page.reload();await sidebar.getByText('已归档',{exact:true}).click();
 await sidebar.getByRole('button',{name:'恢复主对话：阅读会话',exact:true}).click();
 await expect(main.getByText('解释：归档后仍需保留的内容。独立回答。',{exact:true})).toBeVisible();
});

test('keeps the selected models and reasoning settings when switching workspaces',async({page,host,root,directory,modelUrl})=>{
 const workspace=await model(host,root,modelUrl),first=(await host.models.listModelSettings(workspace.id))[0]!;
 await host.models.saveModelSettings(workspace.id,{...first,id:'alternate',model:'alternate-model',credentialRef:''},'fixture-alternate-key');
 const second=join(directory,'另一工作区');await mkdir(second);
 await openWorkspace(page,host,root);const main=page.getByRole('region',{name:'主对话',exact:true});
 await selectControlValue(main.getByRole('combobox',{name:'模型',exact:true}),'alternate');
 await page.getByRole('button',{name:'选择工作区',exact:true}).click();
 await page.getByRole('textbox',{name:'工作区目录'}).fill(second);await page.getByRole('button',{name:'打开此工作区',exact:true}).click();
 await expect(main.getByRole('combobox',{name:'模型',exact:true})).toHaveAttribute('data-value','alternate');
 await page.reload();await expect(main.getByRole('combobox',{name:'模型',exact:true})).toHaveAttribute('data-value','alternate');
});

test('restores the intended legacy model and its pending request when its name collides',async({page,host,root,directory,modelUrl,modelCalls})=>{
 const first=await model(host,root,modelUrl),settings=(await host.models.listModelSettings(first.id))[0]!;
 const secondRoot=join(directory,'legacy-workspace');await mkdir(secondRoot);
 const second=await host.workspaces.select(secondRoot,{callerId:'local-owner',transport:'internal'}),store=await host.workspaces.storeFor(second.id),credentialRef='model.'+second.id+'.test';
 store.putRecord('model-settings','test',{...settings,model:'legacy-selected-model',credentialRef});await new CredentialStore(join(directory,'config')).setSecret(credentialRef,'fixture-legacy-key');
 const session=await host.sessions.createMain(second.id,'旧请求');await store.saveUiState('legacy-client',{mainSessionId:session.id,providers:{main:'test',temporary:'test'}});
 const request={workspaceId:second.id,sessionId:session.id,question:'升级前待确认的问题',documents:[],attachmentIds:[],providerId:'test',requestId:'legacy-pending-request',allowArtifactWrites:false};
 await page.addInitScript(({id,request})=>{localStorage.setItem('reader:client','legacy-client');localStorage.setItem('reader:last-workspace',id);if(!localStorage.getItem('legacy-seeded')){localStorage.setItem('reader:submissions:legacy-client:'+id,JSON.stringify({[request.sessionId]:{request}}));localStorage.setItem('legacy-seeded','true');}},{id:second.id,request});
 await page.goto(host.bootstrapUrl);const main=page.getByRole('region',{name:'主对话',exact:true});
 await expect(main.getByRole('combobox',{name:'模型',exact:true})).toHaveText('legacy-selected-model');
 await expect(main.getByText('解释：升级前待确认的问题。独立回答。',{exact:true})).toBeVisible();expect(modelCalls).toHaveLength(1);expect(modelCalls[0].model).toBe('legacy-selected-model');
 await page.reload();await expect(main.getByRole('combobox',{name:'模型',exact:true})).toHaveText('legacy-selected-model');
 expect(modelCalls).toHaveLength(1);
});

test('explains controls on hover and keyboard focus across themes and viewport sizes',async({page,host,root,modelUrl})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root);await mkdir(evidence,{recursive:true});
 await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true});await expect(file.getByRole('link',{name:'下载原文件',exact:true})).toBeVisible();
 for(const [control,tip] of [
  [file.getByRole('link',{name:'下载原文件',exact:true}),'下载当前文档的原始文件'],
  [file.getByRole('button',{name:'框选文档截图',exact:true}),'拖拽框选文档区域，将截图放入临时对话'],
  [file.getByRole('button',{name:'选择屏幕截图',exact:true}),'选择共享的屏幕或窗口，再框选截图'],
  [page.getByRole('button',{name:'布局设置',exact:true}),'调整工作栏布局、顺序与折叠状态'],
  [page.getByRole('button',{name:'选择工作区',exact:true}),'选择或打开本机的阅读工作区']
 ] as const){await control.hover();await expect(page.getByRole('tooltip')).toHaveText(tip);await page.mouse.move(0,0);}
 const layout=page.getByRole('button',{name:'布局设置',exact:true});await layout.focus();await expect(page.getByRole('tooltip')).toContainText('调整工作栏布局');
 await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 for(const theme of ['light','graphite','ink'])for(const width of [1600,768,390]){
  await page.setViewportSize({width,height:1000});await selectControlValue(page.getByRole('combobox',{name:'界面外观'}),theme);
  await page.getByRole('button',{name:'布局设置',exact:true}).click();await selectControlValue(page.getByRole('combobox',{name:'布局预设',exact:true}),width<1000?'rows':'columns');await page.keyboard.press('Escape');
  if(width<1000&&await page.getByRole('complementary',{name:'工作区侧栏'}).isVisible())await page.getByRole('button',{name:'切换侧栏',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:join(evidence,theme+'-'+width+'.png')});
 }
 await page.setViewportSize({width:1600,height:1000});await page.getByRole('button',{name:'布局设置',exact:true}).hover();
 await expect(page.getByRole('tooltip')).toBeVisible();await page.screenshot({path:join(evidence,'hover-help.png')});
});
