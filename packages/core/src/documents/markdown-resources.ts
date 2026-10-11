import MarkdownIt,{type Token} from 'markdown-it';
import {resourceUri} from '../../../contracts/src/resource-uri.js';
export function markdownResources(text:string):string[]{
 const names=new Set<string>(),walk=(tokens:Token[])=>{for(const token of tokens){if(token.type==='image'){const src=token.attrGet('src');if(src)names.add(resourceUri(src));}if(token.children)walk(token.children);}};
 walk(new MarkdownIt({html:false}).parse(text,{}));return[...names];
}
