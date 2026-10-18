import {mkdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {test,expect,model,openWorkspace} from './fixtures.js';

test('navigates folders lazily, filters only this directory, and restores back/forward history',async({page,host,root})=>{
 const actualRoot=await realpath(root),child=join(actualRoot,'中文目录');await mkdir(child);await mkdir(join(child,'内层'));
 await page.goto(host.bootstrapUrl);await page.getByRole('button',{name:'选择工作区',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'选择工作区',exact:true});await dialog.getByRole('textbox',{name:'工作区目录',exact:true}).fill(root);await dialog.getByRole('button',{name:'浏览目录',exact:true}).click();
 await expect(dialog.getByRole('status',{name:'所选目录',exact:true})).toHaveText(actualRoot);
 await dialog.getByRole('textbox',{name:'筛选当前目录',exact:true}).fill('中文');await expect(dialog.getByRole('button',{name:'进入目录：中文目录',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'进入目录：outputs',exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'进入目录：中文目录',exact:true}).click();await expect(dialog.getByRole('status',{name:'所选目录',exact:true})).toHaveText(child);
 await dialog.getByRole('button',{name:'后退',exact:true}).click();await expect(dialog.getByRole('status',{name:'所选目录',exact:true})).toHaveText(actualRoot);
 await dialog.getByRole('button',{name:'前进',exact:true}).click();await expect(dialog.getByRole('status',{name:'所选目录',exact:true})).toHaveText(child);
 await dialog.getByRole('button',{name:'上一级',exact:true}).click();await expect(dialog.getByRole('status',{name:'所选目录',exact:true})).toHaveText(actualRoot);
 await dialog.getByRole('button',{name:'打开此工作区',exact:true}).click();await expect(page.getByRole('region',{name:'文件',exact:true})).toBeVisible();
});

test('ignores late navigation responses and cannot open their stale directory',async({page,host,root,directory})=>{
 const actualDirectory=await realpath(directory),slow=join(actualDirectory,'slow'),fast=join(actualDirectory,'fast');await mkdir(slow);await mkdir(fast);let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/directories/browser?*',async route=>{const path=new URL(route.request().url()).searchParams.get('path');if(path===slow)await gate;try{await route.continue();}catch{}});
 await page.goto(host.bootstrapUrl);await page.getByRole('button',{name:'选择工作区',exact:true}).click();const dialog=page.getByRole('dialog',{name:'选择工作区',exact:true}),address=dialog.getByRole('textbox',{name:'工作区目录',exact:true});
 await address.fill(slow);await dialog.getByRole('button',{name:'浏览目录',exact:true}).click();await address.fill(fast);await dialog.getByRole('button',{name:'浏览目录',exact:true}).click();await expect(dialog.getByRole('status',{name:'所选目录',exact:true})).toHaveText(fast);release();
 await expect(dialog.getByRole('status',{name:'所选目录',exact:true})).toHaveText(fast);const selection=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/api/v1/workspaces');await dialog.getByRole('button',{name:'打开此工作区',exact:true}).click();expect((await selection).postDataJSON()).toEqual({root:fast});await expect(page.getByRole('region',{name:'文件',exact:true})).toBeVisible();
});

test('shared selectors support keyboard commit, search, Escape focus and themed portals',async({page,host,root,modelUrl})=>{
 const workspace=await model(host,root,modelUrl),first=(await host.models.listModelSettings(workspace.id))[0]!;
 await host.models.saveModelSettings(workspace.id,{...first,id:'alternate',model:'alternate-model',credentialRef:''},'fixture-alternate-key');await openWorkspace(page,host,root);
 const theme=page.getByRole('combobox',{name:'界面外观',exact:true});await theme.focus();await page.keyboard.press('ArrowDown');await expect(page.getByRole('listbox',{name:'界面外观',exact:true})).toBeVisible();await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(page.locator('html')).toHaveAttribute('data-appearance','ink');await expect(theme).toBeFocused();
 const main=page.getByRole('region',{name:'主对话',exact:true}),selector=main.getByRole('combobox',{name:'模型',exact:true});await selector.click();await page.getByRole('textbox',{name:'搜索模型',exact:true}).fill('alternate');await page.getByRole('option',{name:'alternate-model',exact:true}).click();await expect(selector).toHaveAttribute('data-value','alternate');
 await selector.click();await page.getByRole('textbox',{name:'搜索模型',exact:true}).fill('no-such-model');await expect(page.getByRole('status').filter({hasText:'没有匹配的选项'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(selector).toBeFocused();await expect(selector).toHaveAttribute('data-value','alternate');await selector.click();await page.mouse.click(5,5);await expect(page.getByRole('listbox')).toHaveCount(0);await expect(selector).toHaveAttribute('data-value','alternate');await page.reload();await expect(main.getByRole('combobox',{name:'模型',exact:true})).toHaveAttribute('data-value','alternate');
 for(const width of [1600,390])for(const value of ['浅色','石墨灰','墨蓝']){await page.setViewportSize({width,height:900});await theme.click();await page.getByRole('option',{name:value,exact:true}).click();await theme.click();const list=page.getByRole('listbox',{name:'界面外观',exact:true});await expect(list).toBeVisible();const bounds=await list.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);await page.keyboard.press('Escape');}
});
