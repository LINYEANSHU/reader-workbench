import {test,expect,openWorkspace} from './fixtures.js';

test('changes local appearance without changing documents, sessions or the chosen layout',async({page,host,root})=>{
 await openWorkspace(page,host,root);
 await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true});
 await expect(file.locator('.markdown-body')).toContainText('RI');
 await page.getByRole('button',{name:'布局设置',exact:true}).click();
 await page.getByRole('combobox',{name:'布局预设'}).selectOption('rows');
 await page.keyboard.press('Escape');
 const layout=await page.locator('.split-workspace').getAttribute('data-layout');
 const main=await page.getByRole('region',{name:'主对话',exact:true}).getAttribute('data-session-id');
 const temporary=await page.getByRole('region',{name:'临时对话',exact:true}).getAttribute('data-session-id');
 const appearance=page.getByRole('combobox',{name:'界面外观'});
 await expect(appearance).toHaveCount(1);
 await expect(appearance).toHaveValue('light');
 for(const value of ['graphite','ink','light']){
  await appearance.selectOption(value);
  await expect(page.locator('html')).toHaveAttribute('data-appearance',value);
  await expect(file.locator('.markdown-body')).toContainText('RI');
  await expect(page.locator('.split-workspace')).toHaveAttribute('data-layout',layout!);
  await expect(page.getByRole('region',{name:'主对话',exact:true})).toHaveAttribute('data-session-id',main!);
  await expect(page.getByRole('region',{name:'临时对话',exact:true})).toHaveAttribute('data-session-id',temporary!);
 }
 await appearance.selectOption('ink');
 await page.reload();
 await expect(appearance).toHaveValue('ink');
 await expect(page.locator('html')).toHaveAttribute('data-appearance','ink');
 await expect(file.locator('.markdown-body')).toContainText('RI');
 await expect(page.locator('.split-workspace')).toHaveAttribute('data-layout',layout!);
 await expect(page.getByRole('region',{name:'主对话',exact:true})).toHaveAttribute('data-session-id',main!);
 await expect(page.getByRole('region',{name:'临时对话',exact:true})).toHaveAttribute('data-session-id',temporary!);
});

test('keeps a lower-row pane menu inside a medium-height viewport',async({page,host,root})=>{
 await openWorkspace(page,host,root);
 await page.setViewportSize({width:1000,height:600});
 await page.getByRole('button',{name:'布局设置',exact:true}).click();
 await page.getByRole('combobox',{name:'布局预设'}).selectOption('rows');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'主对话栏设置',exact:true}).click();
 const menu=page.getByRole('dialog',{name:'主对话栏设置',exact:true});
 await expect.poll(()=>menu.evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(592);
 await expect.poll(()=>menu.evaluate(node=>node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(8);
 await page.setViewportSize({width:320,height:400});
 await expect.poll(()=>menu.evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(392);
 await expect.poll(()=>menu.evaluate(node=>node.getBoundingClientRect().right)).toBeLessThanOrEqual(312);
 await expect.poll(()=>menu.evaluate(node=>node.getBoundingClientRect().left)).toBeGreaterThanOrEqual(8);
 await expect(menu.getByRole('button',{name:'折叠工作栏',exact:true})).toBeVisible();
});

test('captures the displayed document margin background in every appearance',async({page,host,root})=>{
 await openWorkspace(page,host,root);
 await page.getByRole('button',{name:'reader.md',exact:true}).click();
 const file=page.getByRole('region',{name:'文件',exact:true});
 await expect(file.locator('.markdown-body')).toContainText('RI');
 for(const value of ['light','graphite','ink']){
  await page.getByRole('combobox',{name:'界面外观'}).selectOption(value);
  const scroll=file.locator('.document-scroll');
  const background=await scroll.evaluate(node=>getComputedStyle(node).backgroundColor.match(/[\d.]+/g)!.slice(0,3).map(Number));
  const bounds=(await scroll.boundingBox())!;
  await page.getByRole('button',{name:'框选文档截图',exact:true}).click();
  await page.mouse.move(bounds.x+8,bounds.y+8);
  await page.mouse.down();
  await page.mouse.move(bounds.x+210,bounds.y+160,{steps:8});
  await page.mouse.up();
  const image=page.getByAltText('选中的截图');
  await expect(image).toHaveJSProperty('complete',true);
  const pixel=await image.evaluate((node:HTMLImageElement)=>{
   const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;
   const context=canvas.getContext('2d')!;context.drawImage(node,0,0);
   return [...context.getImageData(1,1,1,1).data];
  });
  expect(pixel).toEqual([...background,255]);
  await page.getByRole('button',{name:'取消',exact:true}).click();
 }
});
