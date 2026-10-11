import ReactMarkdown from 'react-markdown';
import type {UiContribution} from '../../../../packages/contracts/src/layout.js';
export function ContributionView({contribution,onAction,busy}:{contribution:UiContribution;onAction:(id:string)=>void;busy:boolean}){
 if(contribution.kind==='action')return<button disabled={busy} onClick={()=>onAction(contribution.id)}>{contribution.title}</button>;
 if(contribution.kind!=='view'||!contribution.view)return null;
 return<section className="plugin-view" aria-label={contribution.title}><h4>{contribution.title}</h4>{contribution.view.moduleKey==='plain-text'?<pre>{contribution.view.text}</pre>:<ReactMarkdown skipHtml disallowedElements={['img','iframe','script','style','form','input']} components={{a:({href,children})=>href&&/^https?:\/\//.test(href)?<a href={href} target="_blank" rel="noreferrer">{children}</a>:<span>{children}</span>}}>{contribution.view.text}</ReactMarkdown>}</section>;
}
