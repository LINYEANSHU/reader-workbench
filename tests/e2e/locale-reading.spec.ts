import {test,expect,model,openWorkspace} from './fixtures.js';
import {selectControlValue} from './controls.js';
import {PDFDocument} from 'pdf-lib';

test('uses English reading controls while preserving the selected range and PDF source',async({page,host,root},testInfo)=>{
 await openWorkspace(page,host,root,{handleReadingPlan:false});
 await page.evaluate(()=>localStorage.setItem('reader:locale','en'));await page.reload();
 const pdf=await PDFDocument.create();for(let number=1;number<=4;number++)pdf.addPage([300,300]).drawText('SOURCE PAGE '+number,{x:25,y:240});
 await page.locator('input[type=file]').setInputFiles({name:'中文 ranges.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 const dialog=page.getByRole('dialog',{name:'Initial reading range',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('radio',{name:'Custom pages',exact:true}).check();
 await dialog.getByRole('textbox',{name:'Initial reading page range',exact:true}).fill('2-3');
 await expect(dialog.getByRole('status')).toContainText('2 / 4');
 await page.screenshot({path:testInfo.outputPath('reading-range-en-desktop.png')});
 await page.setViewportSize({width:900,height:800});await page.screenshot({path:testInfo.outputPath('reading-range-en-narrow.png')});await page.setViewportSize({width:1600,height:1000});
 await dialog.getByRole('button',{name:'Save reading range',exact:true}).click();
 const file=page.getByRole('region',{name:'Documents',exact:true});
 await expect(file.getByRole('button',{name:'Adjust initial reading range · 2 / 4 pages',exact:true})).toBeVisible();
 await expect(file.locator('.textLayer').first()).toContainText('SOURCE PAGE 1');
 await expect(file.locator('.page-label').first()).toHaveText('Page 1');
 await file.locator('.document-memory summary').click();
 await expect(file.getByRole('textbox',{name:'Search reading memory',exact:true})).toBeVisible();
});

test('translates from English UI without translating the target-language API value or source',async({page,host,root,modelUrl},testInfo)=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root,{handleReadingPlan:false});
 await page.evaluate(()=>localStorage.setItem('reader:locale','en'));await page.reload();
 await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const file=page.getByRole('region',{name:'Documents',exact:true});
 await expect(file.locator('.markdown-body')).toContainText('RI');
 await file.getByRole('button',{name:'Translate document',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Translate document',exact:true});
 await selectControlValue(dialog.getByRole('combobox',{name:'Translation method',exact:true}),'model');
 await expect(dialog.getByRole('combobox',{name:'Target language',exact:true})).toHaveAttribute('data-value','简体中文');
 await expect(dialog.getByRole('combobox',{name:'Target language',exact:true})).toContainText('Simplified Chinese');
 await page.screenshot({path:testInfo.outputPath('translation-en-desktop.png')});
 await page.setViewportSize({width:900,height:800});await page.screenshot({path:testInfo.outputPath('translation-en-narrow.png')});await page.setViewportSize({width:1600,height:1000});
 const request=page.waitForRequest(request=>request.method()==='POST'&&/\/document-processing$/.test(new URL(request.url()).pathname));
 await dialog.getByRole('button',{name:'Start translation',exact:true}).click();
 expect((await request).postDataJSON().targetLanguage).toBe('简体中文');
 await expect(dialog.getByRole('heading',{name:'Translation preview',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Save translation as',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Save translation as',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('Translation saved:');
});

test('updates page memory labels and diagnostics without remounting the source when switching language',async({page,host,root,modelUrl,modelCalls})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root);await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true}),main=page.getByRole('region',{name:'主对话',exact:true});
 await main.getByRole('textbox',{name:'主对话输入'}).fill('Read this source');await main.getByRole('button',{name:'发送',exact:true}).click();
 await expect(file).toContainText('已建立全部 1 页的阅读记忆');await expect(main.locator('.working')).toHaveCount(0);
 await file.locator('.document-memory > summary').click();await file.getByRole('button',{name:'查看页记忆',exact:true}).click();await file.getByRole('button',{name:'读取页记忆',exact:true}).click();
 await expect(file.getByRole('region',{name:'页阅读记忆',exact:true})).toContainText('RI');
 await file.locator('.markdown-body h1').evaluate(node=>node.setAttribute('data-selection-node','preserved'));
 await page.route('**/memory/search?*',route=>route.fulfill({status:400,json:{error:{code:'INVALID_SEARCH',message:'请输入 1–1000 字的检索内容'}}}));
 await file.getByRole('button',{name:'检索',exact:true}).click();await expect(file.getByRole('alert')).toContainText('请输入 1–1000 字的检索内容');
 const callsBeforeSwitch=modelCalls.length;
 await page.getByRole('combobox',{name:'界面语言',exact:true}).click();await page.getByRole('option',{name:'English',exact:true}).click();
 const englishFile=page.getByRole('region',{name:'Documents',exact:true});
 await expect(englishFile.locator('.markdown-body h1')).toHaveAttribute('data-selection-node','preserved');
 await expect(englishFile.locator('.markdown-body h1')).toHaveText('阅读测试 · RI');
 await expect(englishFile.getByRole('region',{name:'Page reading memory',exact:true})).toHaveText(/^Page 1\n\n/);
 await expect(englishFile.getByRole('alert')).toContainText('Enter between 1 and 1,000 characters to search.');
 expect(modelCalls).toHaveLength(callsBeforeSwitch);
});
