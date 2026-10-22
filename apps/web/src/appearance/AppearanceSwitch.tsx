import {useState} from 'react';
import {Sun,Moon} from 'lucide-react';
import {SelectControl} from '../components/SelectControl.js';
import {t,useLocale} from '../i18n/index.js';

export type Appearance='light'|'graphite'|'ink';
const preferenceKey='reader:appearance';

function savedAppearance():Appearance{
 try{
  const value=localStorage.getItem(preferenceKey);
  if(value==='graphite'||value==='ink')return value;
 }catch{}
 return 'light';
}

function showAppearance(value:Appearance){
 document.documentElement.dataset.appearance=value;
 const color=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
}

export function restoreAppearance(){showAppearance(savedAppearance());}

export function AppearanceSwitch(){
 useLocale();
 const [value,setValue]=useState<Appearance>(savedAppearance);
 const change=(next:Appearance)=>{
  showAppearance(next);
  setValue(next);
  try{localStorage.setItem(preferenceKey,next);}catch{}
 };
 return<div className="appearance-switch" data-tooltip={t('切换浅色、石墨灰或墨蓝外观','Switch between light, graphite and ink themes')}>
  {value==='light'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}
  <SelectControl aria-label={t('界面外观','Appearance')} value={value} options={[{value:'light',label:t('浅色','Light')},{value:'graphite',label:t('石墨灰','Graphite')},{value:'ink',label:t('墨蓝','Ink')}]} onChange={next=>change(next as Appearance)}/>
 </div>;
}
