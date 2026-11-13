import type {Page} from '@playwright/test';
import {test,expect,model,openWorkspace} from './fixtures.js';

async function language(page:Page,name:'English'|'简体中文'){
 await page.getByRole('combobox',{name:/^(界面语言|Interface language)$/}).click();
 await page.getByRole('option',{name,exact:true}).click();
}

test('localizes preset selection and reset while preserving unsaved custom text across language changes',async({page,host,root,context},testInfo)=>{
 await openWorkspace(page,host,root);await language(page,'English');
 await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('button',{name:'Prompts & preferences',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('textbox',{name:'System prompt',exact:true})).toHaveValue(/professional and reliable learning and research assistant/);
 await dialog.getByRole('combobox',{name:'Preset style',exact:true}).click();await page.getByRole('option',{name:'Candid',exact:true}).click();
 await expect(dialog.getByRole('textbox',{name:'System prompt',exact:true})).toHaveValue(/candid and direct/);
 const custom='UNSAVED 自定义 $& {locale}';await dialog.getByRole('textbox',{name:'System prompt',exact:true}).fill(custom);
 await dialog.getByRole('textbox',{name:'Personal prompt',exact:true}).fill('PERSONAL 原样');
 const other=await context.newPage();await other.goto(host.url);await language(other,'简体中文');
 await expect(dialog.getByRole('textbox',{name:'系统提示词',exact:true})).toHaveValue(custom);
 await expect(dialog.getByRole('textbox',{name:'个性化提示词',exact:true})).toHaveValue('PERSONAL 原样');
 await dialog.getByRole('button',{name:'恢复默认提示词',exact:true}).click();
 await expect(dialog.getByRole('textbox',{name:'系统提示词',exact:true})).toHaveValue(/你是专业可靠的学习与科研助手/);
 await language(other,'English');await other.close();
 await expect(dialog.getByRole('textbox',{name:'System prompt',exact:true})).toHaveValue(/professional and reliable learning and research assistant/);
 await dialog.locator('summary').filter({hasText:'View combined prompt'}).click();
 await expect(dialog.getByRole('textbox',{name:'Combined prompt preview',exact:true})).toHaveValue(/Expression preferences/);
 for(const width of [1600,390]){await page.setViewportSize({width,height:1000});expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('agent-preferences-en-'+width+'.png')});}
});

test('localizes tool settings while preserving prompts, shortcuts, identifiers and drafts',async({page,host,root,modelUrl})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root);await language(page,'English');
 const main=page.getByRole('region',{name:'Main chat',exact:true});
 await main.getByRole('textbox',{name:'Main chat input',exact:true}).fill('USER 草稿 stays unchanged');
 await expect(main.getByRole('button',{name:'Voice input',exact:true})).toBeVisible();
 await expect(main.getByText('Think with your documents',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Workbench settings',exact:true});
 await expect(dialog.getByRole('region',{name:'Model token usage',exact:true})).toContainText('browser-protocol-test');
 await expect(dialog).toContainText('No requests yet');
 await dialog.getByRole('button',{name:'Capture shortcut',exact:true}).click();
 const shortcut=dialog.getByRole('textbox',{name:'Document screenshot shortcut',exact:true});
 await expect(shortcut).toHaveValue('Mod+Shift+X');await shortcut.fill('Shift+X');
 await dialog.getByRole('button',{name:'Save shortcut',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('The shortcut needs Ctrl, Command or Alt');
 await shortcut.fill('Mod+Shift+X');await dialog.getByRole('button',{name:'Save shortcut',exact:true}).click();
 await dialog.getByRole('button',{name:'Prompts & preferences',exact:true}).click();
 const system=dialog.getByRole('textbox',{name:'System prompt',exact:true});
 await expect(system).toHaveValue(/professional and reliable learning and research assistant/);
 await system.fill('SYSTEM 原文 do not translate');
 await dialog.getByRole('textbox',{name:'Personal prompt',exact:true}).fill('PERSONAL 中文 preference');
 await dialog.getByRole('button',{name:'Save prompts',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('Prompts saved.');
 await dialog.getByRole('button',{name:'Plugins',exact:true}).click();
 await dialog.getByRole('button',{name:'Install terminology helper',exact:true}).click();
 const plugin=dialog.locator('[data-plugin-id="reader-helper"]');
 await expect(plugin).toContainText('reader-helper');
 await expect(plugin.getByRole('spinbutton',{name:'Explanation length',exact:true})).toHaveValue('80');
 await plugin.getByRole('button',{name:'Enable',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Ask about the selection in temporary chat',exact:true})).toBeVisible();
 await expect(dialog.getByRole('textbox',{name:'Tool arguments',exact:true})).toHaveValue('{"text":"你好 AI"}');
 for(const tab of ['Plugins','Prompts & preferences','Model connections']){
  await dialog.getByRole('button',{name:tab,exact:true}).click();
  await page.setViewportSize({width:320,height:1000});
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.setViewportSize({width:1600,height:1000});
 }
 await dialog.getByRole('button',{name:'Close settings',exact:true}).click();
 await language(page,'简体中文');
 await expect(page.getByRole('region',{name:'主对话',exact:true}).getByRole('textbox',{name:'主对话输入',exact:true})).toHaveValue('USER 草稿 stays unchanged');
 await page.getByRole('button',{name:'打开设置',exact:true}).click();
 await page.getByRole('button',{name:'提示词与个性化',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'系统提示词',exact:true})).toHaveValue('SYSTEM 原文 do not translate');
 await expect(page.getByRole('textbox',{name:'个性化提示词',exact:true})).toHaveValue('PERSONAL 中文 preference');
});

test('keeps capture errors and chat content correct when the interface language changes',async({page,host,root,modelUrl,modelCalls})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root);await language(page,'English');
 await page.keyboard.press('ControlOrMeta+Shift+X');
 await expect(page.getByRole('alert')).toContainText('Open a document before capturing a screenshot');
 await language(page,'简体中文');
 await expect(page.getByRole('alert')).toContainText('请先打开可截图的文档');
 await page.getByRole('button',{name:'关闭截图提示',exact:true}).click();
 await language(page,'English');
 const main=page.getByRole('region',{name:'Main chat',exact:true});
 const question='USER 中文 exact content';
 await main.getByRole('textbox',{name:'Main chat input',exact:true}).fill(question);
 const submitted=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/api/v1/runs');
 await main.getByRole('button',{name:'Send',exact:true}).click();
 expect((await submitted).postDataJSON()).toMatchObject({locale:'en',question});
 await expect(main.getByText('解释：'+question+'。独立回答。',{exact:true})).toBeVisible();
 expect(modelCalls.at(-1).messages[0].content).toContain('Reading and permission rules:');
 const stats=page.getByRole('region',{name:'Workspace statistics',exact:true});
 await stats.getByRole('button',{name:'Workspace usage and context details',exact:true}).click();
 await expect(stats).toContainText('All workspace chats');
 await expect(stats).toContainText('1 requests · 0 reported · 1 not reported');
 await expect(stats.getByRole('region',{name:'Main chat context',exact:true})).toContainText('browser-protocol-test');
 await page.keyboard.press('Escape');await language(page,'简体中文');
 await expect(page.getByRole('region',{name:'主对话',exact:true}).getByText('解释：'+question+'。独立回答。',{exact:true})).toBeVisible();
});

test('re-localizes an existing parameterized model error when another tab changes language',async({page,host,root,modelUrl,context})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root);await language(page,'English');
 await page.route('**/settings/models/*/catalog',route=>route.fulfill({status:503,json:{error:{code:'MODEL_CATALOG_FAILED',message:'无法读取模型列表（HTTP 503）'}}}));
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Workbench settings',exact:true});
 await dialog.locator('.model-configuration > summary').click();
 await dialog.getByRole('button',{name:'Load server models',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Cannot load the model list (HTTP 503).');
 const other=await context.newPage();await other.goto(host.url);await language(other,'简体中文');
 await expect(page.getByRole('dialog',{name:'设置',exact:true}).getByRole('alert')).toContainText('无法读取模型列表（HTTP 503）');
 await language(other,'English');await expect(dialog.getByRole('alert')).toContainText('Cannot load the model list (HTTP 503).');
 await other.close();
});
