import {expect,type Locator,type Page} from '@playwright/test';

export async function selectControlValue(control:Locator,value:string){
 if(await control.evaluate(element=>element.tagName==='SELECT')){await control.selectOption(value);return;}
 await control.click();
 const id=await control.getAttribute('aria-controls');expect(id).toBeTruthy();
 const list=control.page().locator('[role="listbox"][id='+JSON.stringify(id)+']');
 await list.locator('[role="option"][data-value='+JSON.stringify(value)+']').click();
 await expect(control).toHaveAttribute('data-value',value);
}

export async function acceptDefaultReadingPlan(page:Page){
 await page.getByRole('dialog',{name:'初次阅读范围'}).getByRole('button',{name:'保存阅读范围',exact:true}).click();
}
