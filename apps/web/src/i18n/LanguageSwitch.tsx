import {Languages} from 'lucide-react';
import {SelectControl} from '../components/SelectControl.js';
import {t,useLocale,type Locale} from './index.js';
import '../styles/language.css';
export function LanguageSwitch(){const{locale,setLocale}=useLocale();return<div className="language-switch"><Languages size={16} aria-hidden="true"/><SelectControl aria-label={t('界面语言','Interface language')} value={locale} options={[{value:'zh-CN',label:'简体中文'},{value:'en',label:'English'}]} onChange={value=>setLocale(value as Locale)}/></div>;}
