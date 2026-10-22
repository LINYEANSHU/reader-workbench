import {test,expect,openWorkspace} from './fixtures.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {WorkspaceMemoryStatus} from '../../packages/contracts/src/workspace-memory.js';
const readyMemory:WorkspaceMemoryStatus={enabled:true,available:true,state:'ready',discoveredFiles:1,indexedFiles:1,uniquePassages:1,sourcePassages:1,skipped:[]};
test('recovers a failed status check without leaving a stale error or loading message',async({page,host,root})=>{
 let failing=true;
 await page.route('**/api/v1/workspaces/*/memory',route=>route.fulfill({status:failing?503:200,json:failing?{error:{code:'TEMPORARY',message:'状态连接暂时中断'}}:readyMemory}));
 await openWorkspace(page,host,root);
 const memory=page.getByRole('group',{name:'工作区记忆'});await memory.locator('summary').click();
 await expect(memory.getByRole('alert')).toContainText('状态连接暂时中断');
 await expect(memory.getByRole('status')).toHaveText('暂时无法读取状态');
 failing=false;
 await memory.locator('summary').click();await memory.locator('summary').click();
 await expect(memory.getByRole('status')).toContainText('已关联 1 份资料');
 await expect(memory.getByRole('alert')).toHaveCount(0);
});
test('invalidates old evidence when editing a query or refreshing and ignores delayed search responses',async({page,host,root})=>{
 await page.route('**/api/v1/workspaces/*/memory',route=>route.fulfill({json:readyMemory}));
 await page.route('**/api/v1/workspaces/*/memory/sync',route=>route.fulfill({status:202,json:{...readyMemory,state:'indexing'}}));
 let release!:()=>void,started!:()=>void;
 const pending=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve);
 await page.route('**/api/v1/workspaces/*/memory/search?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('query')==='延迟问题'){started();await pending;}
  await route.fulfill({json:{items:[{id:'synthetic-source',text:'用于界面回归的合成证据。',sources:[]}]}});
 });
 await openWorkspace(page,host,root);
 const memory=page.getByRole('group',{name:'工作区记忆'});await memory.locator('summary').click();
 const query=memory.getByRole('textbox',{name:'查找关联知识'}),search=memory.getByRole('button',{name:'检索',exact:true}),results=memory.getByRole('region',{name:'工作区知识检索结果'});
 await query.fill('原问题');await search.click();await expect(results).toContainText('合成证据');
 await query.fill('新问题');await expect(results).toHaveCount(0);
 await search.click();await expect(results).toContainText('合成证据');
 await memory.getByRole('button',{name:'更新关联资料'}).click();await expect(results).toHaveCount(0);
 await expect(search).toBeEnabled();await query.fill('延迟问题');await search.click();await entered;
 await query.fill('最终问题');release();await expect(search).toBeEnabled();await expect(results).toHaveCount(0);
 await search.click();await expect(results).toContainText('合成证据');
});
test('shows unavailable workspace memory honestly and preserves the global switch after reload',async({page,host,root})=>{
 await openWorkspace(page,host,root);
 const memory=page.getByRole('group',{name:'工作区记忆'});
 await expect(memory).toBeVisible();await memory.locator('summary').click();
 await expect(memory).toContainText('尚未准备本地记忆组件');
 const enabled=memory.getByRole('checkbox',{name:'自动关联工作区资料'});await expect(enabled).toBeChecked();await enabled.uncheck();
 await expect(memory).toContainText('已关闭');await page.reload();await memory.locator('summary').click();await expect(enabled).not.toBeChecked();
 await enabled.check();await expect(memory).toContainText('尚未准备本地记忆组件');
 await expect(memory.getByRole('button',{name:'处理中…'})).toHaveCount(0);
 await page.screenshot({path:'.superpowers/sdd/2026-10-19-workspace-memory/workspace-memory-1600.png'});
});
test('uses real local Cognee evidence and opens its exact original source from the sidebar',async({page,host,directory})=>{
 test.skip(!process.env.READER_TEST_COGNEE,'Requires explicitly prepared local Cognee runtime');test.setTimeout(180000);
 const root=join(directory,'关联资料 中文');await mkdir(root);await mkdir(join(host.workspaces.configDir,'agent'),{recursive:true});
 await writeFile(join(host.workspaces.configDir,'agent','workspace-memory.json'),await readFile(join(resolve(process.env.READER_TEST_COGNEE!),'agent','workspace-memory.json')));
 await writeFile(join(root,'circuits.md'),'Capacitor impedance is Z_C = 1/(j*omega*C). 电容的阻抗随角频率变化。');
 await writeFile(join(root,'signals.md'),'Fourier transform represents signals in the frequency domain. Capacitor impedance is used in frequency-domain circuit analysis. 傅里叶变换与电容阻抗都用于频域分析。');
 await openWorkspace(page,host,root,{handleReadingPlan:false});
 const memory=page.getByRole('group',{name:'工作区记忆'});await memory.locator('summary').click();
 await expect(memory.getByRole('status')).toContainText('已关联 2 份资料',{timeout:120000});
 await memory.getByRole('textbox',{name:'查找关联知识'}).fill('电容阻抗与频域分析有什么联系？');await memory.getByRole('button',{name:'检索',exact:true}).click();
 const result=memory.getByRole('region',{name:'工作区知识检索结果'});await expect(result).toContainText('circuits.md');await expect(result).toContainText('signals.md');
 await result.getByRole('button',{name:/circuits.md/}).click();await expect(page.getByRole('region',{name:'文件',exact:true})).toContainText('Capacitor impedance');
 await page.screenshot({path:'.superpowers/sdd/2026-10-19-workspace-memory/workspace-memory-ready-1600.png'});
 await page.setViewportSize({width:768,height:1024});await expect(memory).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'.superpowers/sdd/2026-10-19-workspace-memory/workspace-memory-ready-768.png'});
});
