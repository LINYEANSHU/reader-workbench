import {useSyncExternalStore} from 'react';
import {translateDiagnostic} from './messages.js';

export type Locale='zh-CN'|'en';
const key='reader:locale';
let locale:Locale='zh-CN';
const listeners=new Set<()=>void>();
export const getLocale=()=>locale;
export const getIntlLocale=()=>locale==='en'?'en-US':'zh-CN';
export function subscribeLocale(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function showLocale(){if(typeof document!=='undefined'){document.documentElement.lang=locale;document.title=locale==='en'?'Reader Workbench':'Reader Workbench · 阅读工作台';}}
function updateLocale(next:Locale){const changed=locale!==next;locale=next;showLocale();if(changed)for(const listener of listeners)listener();}
export function restoreLocale(){let saved:Locale='zh-CN';try{if(localStorage.getItem(key)==='en')saved='en';}catch{}updateLocale(saved);}
export function setLocale(next:Locale){if(next!=='zh-CN'&&next!=='en')return;updateLocale(next);try{localStorage.setItem(key,next);}catch{}}
export function useLocale(){return{locale:useSyncExternalStore(subscribeLocale,getLocale,()=> 'zh-CN' as const),setLocale};}
export function t(zh:string,en:string,values:Record<string,string|number>={}){return(locale==='en'?en:zh).replace(/\{(\w+)\}/g,(match,name:string)=>Object.hasOwn(values,name)?String(values[name]):match);}
export function localizeMessage(text:string){return translateDiagnostic(text,locale);}
