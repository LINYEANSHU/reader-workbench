import {selectControlValue} from './controls.js';
import {test,expect,openWorkspace,model} from './fixtures.js';

test('opens effort on demand, closes accessibly and sends the selected raw level',async({page,host,root,modelUrl,modelCalls})=>{
 await model(host,root,modelUrl);
 await openWorkspace(page,host,root);
 const main=page.getByRole('region',{name:'主对话',exact:true});
 const temporary=page.getByRole('region',{name:'临时对话',exact:true});
 const trigger=main.getByRole('button',{name:'选择思考强度',exact:true});
 const popup=page.getByRole('dialog',{name:'思考强度',exact:true});
 await expect(page.getByRole('slider',{name:'思考强度'})).toHaveCount(0,{timeout:1500});
 await trigger.click();
 const slider=popup.getByRole('slider',{name:'思考强度'});
 await expect(slider).toBeFocused();
 await slider.press('Home');
 await expect(trigger).toContainText('low');
 await expect(temporary.getByRole('button',{name:'选择思考强度'})).toContainText('high');
 await slider.press('Escape');
 await expect(popup).toHaveCount(0);
 await expect(trigger).toBeFocused();
 await trigger.click();
 await main.getByRole('textbox',{name:'主对话输入'}).click({position:{x:12,y:12}});
 await expect(popup).toHaveCount(0);
 await main.getByRole('textbox',{name:'主对话输入'}).fill('滑条档位验证');
 await main.getByRole('button',{name:'发送',exact:true}).click();
 await expect(main.getByText('解释：滑条档位验证。独立回答。',{exact:true})).toBeVisible();
 await expect(main.locator('.working')).toHaveCount(0);
 expect(modelCalls.at(-1).reasoning_effort).toBe('low');
});

test('keeps the effort popup within a shrinking viewport and follows the current theme',async({page,host,root,modelUrl})=>{
 await model(host,root,modelUrl);
 await openWorkspace(page,host,root);
 await page.getByRole('button',{name:'切换侧栏'}).click();
 const main=page.getByRole('region',{name:'主对话',exact:true});
 const popup=page.getByRole('dialog',{name:'思考强度',exact:true});
 for(const theme of ['light','graphite','ink']){
  await page.setViewportSize({width:1000,height:600});
  await selectControlValue(page.getByRole('combobox',{name:'界面外观'}),theme);
  await main.getByRole('button',{name:'选择思考强度'}).click();
  await page.setViewportSize({width:320,height:400});
  await expect(async()=>{
   const bounds=(await popup.boundingBox())!;
   expect(bounds.x).toBeGreaterThanOrEqual(8);expect(bounds.x+bounds.width).toBeLessThanOrEqual(312);
   expect(bounds.y).toBeGreaterThanOrEqual(8);expect(bounds.y+bounds.height).toBeLessThanOrEqual(392);
  }).toPass({timeout:15000});
  const colors=await popup.locator('.effort-slider').evaluate(node=>{const css=getComputedStyle(node);return{accent:css.getPropertyValue('--effort-accent').trim(),theme:css.getPropertyValue('--blue').trim()};});
  expect(colors.accent).toBe(colors.theme);
  await page.keyboard.press('Escape');
 }
 await page.keyboard.press('Escape');
 await expect(popup).toHaveCount(0);
});
