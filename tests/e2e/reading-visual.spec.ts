import {mkdir,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {test,expect,model} from './fixtures.js';
import {selectControlValue} from './controls.js';

const evidence=resolve('docs/evidence/2026-10-18/reading-controls');
test('captures the delivered reading controls and translation states in three themes',async({page,host,root,modelUrl})=>{
 test.setTimeout(120000);await mkdir(evidence,{recursive:true});await model(host,root,modelUrl);
 await page.goto(host.bootstrapUrl);await page.getByRole('button',{name:'选择工作区',exact:true}).click();
 const explorer=page.getByRole('dialog',{name:'选择工作区',exact:true});
 await explorer.getByRole('textbox',{name:'工作区目录'}).fill(root);await explorer.getByRole('textbox',{name:'工作区目录'}).press('Enter');
 await expect(explorer.getByRole('status',{name:'所选目录',exact:true})).toContainText(await realpath(root));
 expect((await explorer.boundingBox())!.width).toBeGreaterThan(800);
 await explorer.screenshot({path:resolve(evidence,'explorer-light-1600.png')});
 await page.setViewportSize({width:390,height:900});await explorer.screenshot({path:resolve(evidence,'explorer-light-390.png')});
 await explorer.getByRole('button',{name:'打开此工作区'}).click();await page.setViewportSize({width:1600,height:1000});
 await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true});await expect(file.locator('.markdown-body')).toContainText('RI');
 for(const theme of ['light','graphite','ink']){
  await selectControlValue(page.getByRole('combobox',{name:'界面外观'}),theme);
  for(const width of [1600,390]){
   await page.setViewportSize({width,height:1000});
   const sidebar=page.getByRole('complementary',{name:'工作区侧栏'}),sidebarOpen=await sidebar.isVisible();
   if(width===390&&sidebarOpen||width===1600&&!sidebarOpen)await page.getByRole('button',{name:'切换侧栏',exact:true}).click();
   await page.getByRole('button',{name:'布局设置',exact:true}).click();await selectControlValue(page.getByRole('combobox',{name:'布局预设'}),width===390?'rows':'columns');await page.keyboard.press('Escape');
   await page.getByRole('combobox',{name:'界面外观'}).click();
   const popup=page.locator('.select-popover');await expect(popup).toBeVisible();
   const box=(await popup.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
   await page.screenshot({path:resolve(evidence,theme+'-appearance-'+width+'.png')});await page.keyboard.press('Escape');
   await page.getByRole('region',{name:'主对话',exact:true}).getByRole('combobox',{name:'模型',exact:true}).click();
   await expect(popup).toBeVisible();await page.screenshot({path:resolve(evidence,theme+'-model-'+width+'.png')});await page.keyboard.press('Escape');
  }
 }
 await page.setViewportSize({width:1600,height:1000});
 if(!await page.getByRole('complementary',{name:'工作区侧栏'}).isVisible())await page.getByRole('button',{name:'切换侧栏',exact:true}).click();
 await file.getByRole('button',{name:'一键翻译',exact:true}).click();
 const translation=page.getByRole('dialog',{name:'翻译文档'});await translation.screenshot({path:resolve(evidence,'translation-options.png')});
 await selectControlValue(translation.getByRole('combobox',{name:'翻译方式',exact:true}),'model');
 await translation.getByRole('button',{name:'开始翻译',exact:true}).click();await expect(translation.getByRole('heading',{name:'译文预览'})).toBeVisible();
 await expect(translation.getByRole('table')).toBeVisible();
 await translation.screenshot({path:resolve(evidence,'translation-preview.png')});await translation.getByRole('button',{name:'关闭翻译',exact:true}).click();
 const pdf=await PDFDocument.create();for(let number=1;number<=12;number++)pdf.addPage([300,300]).drawText('Source page '+number,{x:25,y:240});
 await page.locator('input[type=file]').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 const reading=page.getByRole('dialog',{name:'初次阅读范围'});await expect(reading).toBeVisible();
 await reading.getByRole('radio',{name:'自定义页码'}).check();await reading.getByRole('textbox',{name:'初读页码范围'}).fill('2-3,8');
 await reading.screenshot({path:resolve(evidence,'reading-range-ink-1600.png')});
 await page.setViewportSize({width:390,height:900});await reading.screenshot({path:resolve(evidence,'reading-range-ink-390.png')});
 await reading.getByRole('button',{name:'保存阅读范围',exact:true}).click();
});
