import {test,expect,openWorkspace} from './fixtures.js';
import {selectControlValue} from './controls.js';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';

test('translates and saves both directions offline without configured models',async({page,host,root})=>{
 test.skip(process.env.READER_TEST_LOCAL_TRANSLATION!=='1','Requires deployed local CPU translation assets');
 await writeFile(join(root,'offline.md'),'# The weather\n\nThe weather is beautiful today.\n\n$x = 2$\n\n`const x = 2`');
 await openWorkspace(page,host,root,{handleReadingPlan:false});
 const workspace=(await host.workspaces.listRecent({callerId:'local-owner',transport:'internal'}))[0]!;
 expect(await host.models.listModelSettings(workspace.id)).toEqual([]);
 await page.getByRole('button',{name:'offline.md',exact:true}).click();
 await page.getByRole('button',{name:'一键翻译',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'翻译文档'});
 await expect(dialog.getByRole('combobox',{name:'翻译方式',exact:true})).toHaveAttribute('data-value','local');
 await expect(dialog.getByRole('combobox',{name:'翻译模型',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('status')).toContainText('离线引擎已就绪');
 await dialog.getByRole('button',{name:'开始翻译',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'译文预览',exact:true})).toBeVisible({timeout:60000});
 await expect(dialog.locator('.translation-preview')).toContainText('天气');
 await dialog.getByRole('button',{name:'另存译文',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('译文已保存');
 await mkdir('docs/evidence/2026-10-18/offline-translation',{recursive:true});
 await page.screenshot({path:'docs/evidence/2026-10-18/offline-translation/chinese-preview.png'});
 const artifact=(await host.artifacts.list(workspace.id))[0]!,chinese=await readFile(join(root,artifact.relativePath),'utf8');
 expect(chinese).toContain('$x = 2$');expect(chinese).toContain('`const x = 2`');
 expect(await readFile(join(root,'offline.md'),'utf8')).toContain('The weather is beautiful today.');
 await dialog.getByRole('button',{name:'打开译文',exact:true}).click();
 await page.getByRole('button',{name:'一键翻译',exact:true}).click();dialog=page.getByRole('dialog',{name:'翻译文档'});
 await selectControlValue(dialog.getByRole('combobox',{name:'目标语言',exact:true}),'English');
 await dialog.getByRole('button',{name:'开始翻译',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'译文预览',exact:true})).toBeVisible({timeout:60000});
 await expect(dialog.locator('.translation-preview')).toContainText(/weather/i);
 await page.screenshot({path:'docs/evidence/2026-10-18/offline-translation/english-preview.png'});
});

test('shows missing local assets without requiring a model key or downloading silently',async({page,host,root})=>{
 await page.route('**/api/v1/translation/local',route=>route.fulfill({json:{ready:false,error:'本地翻译引擎文件不完整，请运行 scripts/setup-local-translation.ps1'}}));
 await openWorkspace(page,host,root,{handleReadingPlan:false});await page.getByRole('button',{name:'reader.md',exact:true}).click();await page.getByRole('button',{name:'一键翻译',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'翻译文档'});await expect(dialog.getByRole('status')).toContainText('setup-local-translation.ps1');await expect(dialog.getByRole('button',{name:'开始翻译',exact:true})).toBeDisabled();
});
