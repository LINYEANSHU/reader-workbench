declare module 'markdown-it'{
 export interface Token{type:string;children:Token[]|null;attrGet(name:string):string|null}
 export default class MarkdownIt{constructor(options?:{html?:boolean});parse(text:string,environment:Record<string,unknown>):Token[]}
}
