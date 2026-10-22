import {test,expect,openWorkspace} from './fixtures.js';

test('switches the whole workbench to English and keeps the language and draft after reload',async({page,host,root})=>{
 await page.goto(host.bootstrapUrl);
 await page.getByRole('combobox',{name:'界面语言',exact:true}).click();
 await page.getByRole('option',{name:'English',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.getByRole('button',{name:'Choose workspace',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Choose workspace',exact:true}).click();
 await page.getByRole('textbox',{name:'Workspace directory',exact:true}).fill(root);
 await page.getByRole('button',{name:'Open workspace',exact:true}).click();
 const main=page.getByRole('region',{name:'Main chat',exact:true});
 const draft=main.getByRole('textbox');await draft.fill('USER_CONTENT 中文 draft');
 await page.getByRole('combobox',{name:'Interface language',exact:true}).click();
 await page.getByRole('option',{name:'简体中文',exact:true}).click();
 await expect(page.getByRole('region',{name:'主对话',exact:true}).getByRole('textbox')).toHaveValue('USER_CONTENT 中文 draft');
 await page.getByRole('combobox',{name:'界面语言',exact:true}).click();await page.getByRole('option',{name:'English',exact:true}).click();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.getByRole('region',{name:'Main chat',exact:true}).getByRole('textbox')).toHaveValue('USER_CONTENT 中文 draft');
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Workbench settings',exact:true})).toBeVisible();
});

test('starts in Chinese when the stored language is invalid',async({page,host,root})=>{
 await page.addInitScript(()=>localStorage.setItem('reader:locale','unsupported'));
 await openWorkspace(page,host,root);
 await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
 await expect(page.getByRole('combobox',{name:'界面语言',exact:true})).toBeVisible();
});

test('keeps welcome language controls usable on a narrow screen',async({page,host})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(host.bootstrapUrl);
 await page.getByRole('combobox',{name:'界面语言',exact:true}).click();await page.getByRole('option',{name:'English',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await expect(page.getByRole('combobox',{name:'Interface language',exact:true})).toBeVisible();
 await page.screenshot({path:'.superpowers/sdd/2026-10-22-bilingual-interface/welcome-390.png',fullPage:true});
});

test('keeps English controls within desktop and narrow viewports without changing source text',async({page,host,root})=>{
 await openWorkspace(page,host,root);
 await page.getByRole('combobox',{name:'界面语言',exact:true}).click();await page.getByRole('option',{name:'English',exact:true}).click();
 await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const source=page.getByRole('region',{name:'Documents',exact:true});
 await expect(source.locator('.markdown-body')).toContainText('RI');
 await page.getByRole('group',{name:'Workspace memory'}).locator('summary').click();
 for(const width of [1600,768,390]){
  await page.setViewportSize({width,height:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.getByRole('combobox',{name:'Interface language',exact:true})).toBeVisible();
  await page.screenshot({path:'.superpowers/sdd/2026-10-22-bilingual-interface/english-'+width+'.png',fullPage:true});
 }
});
