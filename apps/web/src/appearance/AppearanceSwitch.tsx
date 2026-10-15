import {useState} from 'react';
import {Sun,Moon} from 'lucide-react';

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
 const [value,setValue]=useState<Appearance>(savedAppearance);
 const change=(next:Appearance)=>{
  showAppearance(next);
  setValue(next);
  try{localStorage.setItem(preferenceKey,next);}catch{}
 };
 return<label className="appearance-switch">
  {value==='light'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}
  <span className="sr-only">界面外观</span>
  <select aria-label="界面外观" value={value} onChange={event=>change(event.target.value as Appearance)}>
   <option value="light">浅色</option>
   <option value="graphite">石墨灰</option>
   <option value="ink">墨蓝</option>
  </select>
 </label>;
}
