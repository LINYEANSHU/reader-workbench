import {afterEach,expect,it,vi} from 'vitest';
import {getLocale,getIntlLocale,localizeMessage,restoreLocale,setLocale,subscribeLocale,t} from '../../apps/web/src/i18n/index.js';
import {ApiError,errorText,message} from '../../apps/web/src/api/client.js';
afterEach(()=>{vi.unstubAllGlobals();setLocale('zh-CN');});
it('restores only supported saved languages and retains an in-memory choice when storage is unavailable',()=>{
 vi.stubGlobal('localStorage',{getItem:()=> 'en',setItem:vi.fn()});restoreLocale();expect(getLocale()).toBe('en');expect(getIntlLocale()).toBe('en-US');
 vi.stubGlobal('localStorage',{getItem:()=> 'invalid',setItem:vi.fn()});restoreLocale();expect(getLocale()).toBe('zh-CN');
 vi.stubGlobal('localStorage',{getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}});
 expect(()=>restoreLocale()).not.toThrow();setLocale('en');expect(getLocale()).toBe('en');
});
it('persists locale changes and notifies subscribers without remounting the app',()=>{
 const storage={getItem:()=>null,setItem:vi.fn()};vi.stubGlobal('localStorage',storage);
 const listener=vi.fn(),unsubscribe=subscribeLocale(listener);setLocale('en');expect(listener).toHaveBeenCalledOnce();
 expect(storage.setItem).toHaveBeenCalledWith('reader:locale','en');unsubscribe();setLocale('zh-CN');expect(listener).toHaveBeenCalledOnce();
});
it('interpolates whole translated phrases and treats inserted user content as literal text',()=>{
 setLocale('en');expect(t('第 {page} 页 · {name}','Page {page} · {name}',{page:2,name:'中文 $& {page}'})).toBe('Page 2 · 中文 $& {page}');
 setLocale('zh-CN');expect(t('第 {page} 页','Page {page}',{page:3})).toBe('第 3 页');
});
it('localizes application diagnostics while preserving unknown source content',()=>{
 setLocale('en');expect(localizeMessage('请等待文档解析完成')).toBe('Wait for document parsing to finish.');
 expect(localizeMessage('用户自己的中文材料')).toBe('用户自己的中文材料');
});
it('keeps a stored API diagnostic in its original form so both languages can render it',()=>{
 setLocale('en');const stored=errorText(new ApiError('MODEL_API_ERROR','无法读取模型列表（HTTP 503）',502));
 expect(stored).toBe('无法读取模型列表（HTTP 503）');expect(message(stored)).toBe('Cannot load the model list (HTTP 503).');
 setLocale('zh-CN');expect(message(stored)).toBe('无法读取模型列表（HTTP 503）');
});
