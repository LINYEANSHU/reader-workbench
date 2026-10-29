import {selectControlValue} from './controls.js';
import {test,expect,model,openWorkspace} from './fixtures.js';
import {PDFDocument} from 'pdf-lib';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

test('configures a discontinuous first reading before sending only those PDF pages',async({page,host,root,modelUrl,modelCalls})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root,{handleReadingPlan:false});
 const pdf=await PDFDocument.create();for(let number=1;number<=20;number++)pdf.addPage([300,300]).drawText('SOURCE PAGE '+number,{x:25,y:240});
 await page.locator('input[type=file]').setInputFiles({name:'ranges.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 const dialog=page.getByRole('dialog',{name:'初次阅读范围'});
 await expect(dialog).toBeVisible();expect(modelCalls).toHaveLength(0);
 await dialog.getByRole('radio',{name:'自定义页码'}).check();
 await dialog.getByRole('textbox',{name:'初读页码范围'}).fill('2-3,10-15');
 await expect(dialog.getByRole('status')).toContainText('8');
 await dialog.getByRole('button',{name:'保存阅读范围',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 const main=page.getByRole('region',{name:'主对话',exact:true});
 await main.getByRole('textbox',{name:'主对话输入'}).fill('解释所选范围');await main.getByRole('button',{name:'发送',exact:true}).click();
 await expect(main.getByText('解释：解释所选范围。独立回答。',{exact:true})).toBeVisible();
 const imagePages=modelCalls.flatMap(call=>call.messages.flatMap((message:any)=>Array.isArray(message.content)?message.content.filter((part:any)=>part.type==='text'&&/^文档页 /.test(part.text)).map((part:any)=>Number(part.text.match(/文档页 (\d+)/)?.[1])):[]));
 expect(imagePages).toEqual([2,3,10,11,12,13,14,15]);
 await expect(page.getByRole('region',{name:'文件',exact:true})).toContainText('8 / 20');
 await page.reload();await expect(dialog).toHaveCount(0);
});

test('rejects invalid initial ranges and lets the reader keep the original open',async({page,host,root,modelUrl})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root,{handleReadingPlan:false});
 const pdf=await PDFDocument.create();pdf.addPage([300,300]).drawText('Only page');
 await page.locator('input[type=file]').setInputFiles({name:'one.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 const dialog=page.getByRole('dialog',{name:'初次阅读范围'});await expect(dialog).toBeVisible();
 await dialog.getByRole('radio',{name:'自定义页码'}).check();await dialog.getByRole('textbox',{name:'初读页码范围'}).fill('0,2-4');
 await expect(dialog.getByRole('button',{name:'保存阅读范围',exact:true})).toBeDisabled();await expect(dialog.getByRole('alert')).toBeVisible();
 await dialog.getByRole('button',{name:'仅打开文档',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.pdf-page').first()).toBeVisible();
});

test('translates Markdown through the plugin, previews it, and saves a separate file',async({page,host,root,modelUrl,modelCalls})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root,{handleReadingPlan:false});
 await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true});
 await file.getByRole('button',{name:'一键翻译',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'翻译文档'});await expect(dialog).toBeVisible();
 await selectControlValue(dialog.getByRole('combobox',{name:'翻译方式',exact:true}),'model');
 await dialog.getByRole('button',{name:'开始翻译',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'译文预览',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'另存译文',exact:true})).toBeEnabled();
 expect(modelCalls.some(call=>String(call.messages?.[0]?.content).includes('DOCUMENT_TRANSLATION_BLOCKS'))).toBe(true);
 await dialog.getByRole('button',{name:'另存译文',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('译文已保存');
 await expect(dialog.getByRole('button',{name:'打开译文',exact:true})).toBeVisible();
});

test('opens a page-level Markdown memory result at its actual text source',async({page,host,root,modelUrl})=>{
 const workspace=await model(host,root,modelUrl);
 await writeFile(join(root,'long.md'),'# Actual source\n\n'+Array.from({length:60},(_,i)=>'Paragraph '+i+' explains the source in detail.').join('\n\n'));
 await openWorkspace(page,host,root);await page.getByRole('button',{name:'long.md',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true}),main=page.getByRole('region',{name:'主对话',exact:true});
 await expect(file.locator('.markdown-body h1')).toContainText('Actual source');
 await main.getByRole('textbox',{name:'主对话输入'}).fill('Read source');await main.getByRole('button',{name:'发送',exact:true}).click();
 await expect(main.locator('.assistant-message')).toContainText('独立回答');await expect(main.locator('.working')).toHaveCount(0);
 const document=(await host.documents.list(workspace.id)).find(value=>value.relativePath==='long.md')!;
 await page.route('**/memory/search?*',route=>route.fulfill({json:{pageCount:1,completedPages:[1],entries:[{id:'1:formula:0',kind:'formula',text:'Equation known only at page level',granularity:'page',score:1,anchor:{workspaceId:workspace.id,documentId:document.documentId,version:document.version,location:{kind:'page',page:1}}}]}}));
 await file.locator('.document-memory summary').click();await file.getByRole('button',{name:'检索',exact:true}).click();
 await expect(file.getByRole('button',{name:'打开原文 1:formula:0',exact:true})).toBeVisible();
 await file.locator('.document-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight;});
 await file.getByRole('button',{name:'打开原文 1:formula:0',exact:true}).click();
 await expect(file.locator('.markdown-body .source-block-highlight')).toHaveCount(0);
 await expect.poll(()=>file.locator('.document-scroll').evaluate(node=>node.scrollTop)).toBeLessThan(10);
});

test('offers only AI questions for selected PDF text and no selection translation file',async({page,host,root,modelUrl,modelCalls})=>{
 await model(host,root,modelUrl);await openWorkspace(page,host,root);await page.getByRole('button',{name:'reader.pdf',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true}),layer=file.locator('.textLayer').first();await expect(layer).toContainText('RI');
 const points=await layer.evaluate(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let text:Node|null;while(text=walker.nextNode()){const index=text.textContent?.indexOf('RI')??-1;if(index<0)continue;const range=document.createRange();range.setStart(text,index);range.setEnd(text,index+2);const rect=range.getBoundingClientRect();return{x:rect.left+1,y:rect.top+rect.height/2,end:rect.right-1};}throw Error('Selectable PDF source absent');});
 await page.mouse.move(points.x,points.y);await page.mouse.down();await page.mouse.move(points.end,points.y,{steps:10});await page.mouse.up();await page.mouse.click(points.end,points.y,{button:'right'});
 const menu=page.getByRole('menu');await expect(menu.getByRole('menuitem',{name:'询问 AI',exact:true})).toBeVisible();
 await expect(menu.getByRole('menuitem')).toHaveCount(2);await expect(menu.getByRole('menuitem',{name:'翻译所选文字',exact:true})).toHaveCount(0);
 expect(modelCalls).toHaveLength(0);
});
