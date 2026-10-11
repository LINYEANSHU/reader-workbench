import {createRequire} from 'node:module';import {createCanvas,loadImage} from '@napi-rs/canvas';
type MathEngine=Awaited<ReturnType<typeof import('mathjax').init>>;
let engine:Promise<MathEngine>|undefined;
async function loadEngine(){
 const localRequire=createRequire(import.meta.url);const global=globalThis as typeof globalThis&{MathJax?:{loader?:Record<string,unknown>}};
 global.MathJax??={};global.MathJax.loader={...global.MathJax.loader,require:(file:string)=>localRequire(file)};
 const {init}=await import('mathjax');return init({loader:{load:['input/tex','output/svg']},tex:{packages:['base','ams','newcommand'],maxBuffer:12000},output:{font:'mathjax-newcm'},svg:{fontCache:'none'}});
}
export async function formulaImage(tex:string,signal:AbortSignal){
 signal.throwIfAborted();if(tex.length>12000)throw new Error('formula too long');
 engine??=loadEngine();
 const math=await engine,node=await math.tex2svgPromise(tex,{display:true,em:24,ex:12,containerWidth:600});signal.throwIfAborted();
 let svg=math.startup.adaptor.serializeXML(math.startup.adaptor.tags(node,'svg')[0]);if(svg.includes('data-mjx-error'))throw new Error('invalid formula');
 const box=svg.match(/viewBox="([^"]+)"/)?.[1]?.split(' ').map(Number);if(!box||box.length!==4)throw new Error('invalid svg');
 const width=Math.min(2400,Math.max(24,Math.ceil(box[2]!/1000*24))),height=Math.min(1600,Math.max(24,Math.ceil(box[3]!/1000*24)));
 const pixelWidth=width*3,pixelHeight=height*3;
 svg=svg.replace(/width="[^"]*"/,'width="'+pixelWidth+'px"').replace(/height="[^"]*"/,'height="'+pixelHeight+'px"').replaceAll('currentColor','#17212b');
 const image=await loadImage(Buffer.from(svg)),canvas=createCanvas(pixelWidth,pixelHeight);canvas.getContext('2d').drawImage(image,0,0,pixelWidth,pixelHeight);signal.throwIfAborted();return{data:canvas.toBuffer('image/png'),width,height};
}
