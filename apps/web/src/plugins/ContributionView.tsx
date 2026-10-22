import ReactMarkdown from 'react-markdown';
import type {UiContribution} from '../../../../packages/contracts/src/layout.js';
import {t,useLocale} from '../i18n/index.js';
export function ContributionView({contribution,onAction,busy}:{contribution:UiContribution;onAction:(id:string)=>void;busy:boolean}){
 useLocale();
 const title=contribution.id==='reader-helper.ask-selection'&&contribution.title==='把选区带到临时提问'?t('把选区带到临时提问','Ask about the selection in temporary chat'):contribution.id==='reader-helper.help'&&contribution.title==='术语助手'?t('术语助手','Terminology helper'):contribution.title;
 if(contribution.kind==='action')return<button disabled={busy} onClick={()=>onAction(contribution.id)}>{title}</button>;
 if(contribution.kind!=='view'||!contribution.view)return null;
 const text=contribution.id==='reader-helper.help'&&contribution.view.text==='选择原文，再使用临时对话讨论术语。解释字数可在插件设置中调整。'?t('选择原文，再使用临时对话讨论术语。解释字数可在插件设置中调整。','Select source text, then discuss terms in temporary chat. Adjust the explanation length in plugin settings.'):contribution.view.text;
 return<section className="plugin-view" aria-label={title}><h4>{title}</h4>{contribution.view.moduleKey==='plain-text'?<pre>{text}</pre>:<ReactMarkdown skipHtml disallowedElements={['img','iframe','script','style','form','input']} components={{a:({href,children})=>href&&/^https?:\/\//.test(href)?<a href={href} target="_blank" rel="noreferrer">{children}</a>:<span>{children}</span>}}>{text}</ReactMarkdown>}</section>;
}
