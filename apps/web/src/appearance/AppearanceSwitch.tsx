import {useState} from 'react';
import {Sun,Moon} from 'lucide-react';
import {SelectControl} from '../components/SelectControl.js';
import {t,useLocale} from '../i18n/index.js';

export type Appearance='light'|'graphite'|'lamp';
const preferenceKey='reader:appearance';

function savedAppearance():Appearance{
 try{
  const value=localStorage.getItem(preferenceKey);
  if(value==='graphite'||value==='lamp')return value;
  // The retired ink theme was the other dark option; lamplight replaces it.
  if(value==='ink')return 'lamp';
 }catch{}
 return 'light';
}

function showAppearance(value:Appearance){
 const root=document.documentElement;
 // Switch every surface in the same frame instead of letting transitioned controls fade behind the rest.
 root.classList.add('appearance-changing');
 root.dataset.appearance=value;
 const color=getComputedStyle(root).getPropertyValue('--bg').trim();
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
 requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.remove('appearance-changing')));
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
 return<div className="appearance-switch" data-tooltip={t('切换浅色、石墨灰或灯下外观','Switch between light, graphite and lamplight themes')}>
  {value==='light'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}
  <SelectControl aria-label={t('界面外观','Appearance')} value={value} options={[{value:'light',label:t('浅色','Light')},{value:'graphite',label:t('石墨灰','Graphite')},{value:'lamp',label:t('灯下','Lamplight')}]} onChange={next=>change(next as Appearance)}/>
 </div>;
}
