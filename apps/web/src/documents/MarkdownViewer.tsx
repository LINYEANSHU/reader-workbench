import {createElement,useMemo,type ReactNode} from 'react';import Markdown,{defaultUrlTransform,type Components,type ExtraProps} from 'react-markdown';import remarkGfm from 'remark-gfm';import remarkMath from 'remark-math';import rehypeKatex from 'rehype-katex';
import type {DocumentRef} from '../../../../packages/contracts/src/documents.js';import {documentUrl} from '../api/client.js';
import {annotateMarkdown} from '../selection/anchors.js';
export function MarkdownViewer({text,document}:{text:string;document?:DocumentRef}){
 return useMemo(()=>{
 let position=0;const blocks=text.split(/\n\s*\n/).filter(Boolean).map((part,index)=>{const start=text.indexOf(part,position);position=start+part.length;return{id:'b'+index,start,end:position};});
 const block=(tag:string)=>({node,children}:ExtraProps&{children?:ReactNode})=>{const offset=node?.position?.start.offset??0,source=blocks.find(block=>offset>=block.start&&offset<=block.end);return createElement(tag,{'data-block-id':document?source?.id:undefined,'data-source-start':document?offset:undefined,'data-block-start':document?source?.start:undefined,'data-block-length':document?source?source.end-source.start:undefined:undefined},children);};
 const components:Components={h1:block('h1'),h2:block('h2'),h3:block('h3'),h4:block('h4'),h5:block('h5'),h6:block('h6'),p:block('p'),table:block('table'),pre:block('pre'),li:block('li'),a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:({src,alt})=>{
  if(typeof src!=='string')return<span className="resource-missing">图片不可用：{alt}</span>;
  if(src.startsWith('data:image/')&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)&&src.length<16*1024*1024)return<img src={src} alt={alt}/>;
  if(!document||/^[a-z]+:/i.test(src)||src.startsWith('//')||src.startsWith('/'))return<span className="resource-missing">外部图片：{alt??src}（未加载）</span>;
  return<img src={documentUrl(document,'/resources?path='+encodeURIComponent(src))} alt={alt} onError={event=>{event.currentTarget.classList.add('resource-error');event.currentTarget.title='图片不存在或不属于此文档版本';}}/>;
 }};
 return<div className="markdown-body"><Markdown skipHtml remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[...(document?[annotateMarkdown(text,blocks)]:[]),[rehypeKatex,{strict:'warn',throwOnError:false,trust:false}]]} components={components} urlTransform={url=>url.startsWith('data:image/')?url:defaultUrlTransform(url)}>{text}</Markdown></div>;
 },[text,document?.workspaceId,document?.documentId,document?.version]);
}
