declare module 'mathjax' {
 export function init(config:Record<string,unknown>):Promise<{tex2svgPromise(tex:string,options:Record<string,unknown>):Promise<unknown>;startup:{adaptor:{tags(node:unknown,name:string):unknown[];serializeXML(node:unknown):string}}}>;
}
