import {useState} from 'react';
import {Sun,Moon} from 'lucide-react';
import {SelectControl} from '../components/SelectControl.js';

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
 return<div className="appearance-switch" data-tooltip="切换浅色、石墨灰或墨蓝外观">
  {value==='light'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}
  <SelectControl aria-label="界面外观" value={value} options={[{value:"light",label:"浅色"},{value:"graphite",label:"石墨灰"},{value:"ink",label:"墨蓝"}]} onChange={next=>change(next as Appearance)}/>
 </div>;
}
