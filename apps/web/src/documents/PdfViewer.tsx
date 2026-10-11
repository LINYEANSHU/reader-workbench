import {useEffect,useRef,useState} from 'react';import {getDocument,GlobalWorkerOptions,TextLayer,type PDFDocumentProxy,type RenderTask,type PDFPageProxy} from 'pdfjs-dist';import 'pdfjs-dist/web/pdf_viewer.css';
import type {DocumentRecord,SourceAnchor} from '../../../../packages/contracts/src/documents.js';import {documentUrl,message} from '../api/client.js';
GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
function PdfPage({pdf,number,width,document,aspect}:{pdf:PDFDocumentProxy;number:number;width:number;document:DocumentRecord;aspect:number}){
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),text=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(number===1),[height,setHeight]=useState(width*aspect),[error,setError]=useState('');
 useEffect(()=>{const observer=new IntersectionObserver(entries=>{setVisible(entries.some(entry=>entry.isIntersecting));},{root:root.current?.closest('.pane-scroll')??null,rootMargin:'600px'});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!visible)return;let cancelled=false,render:RenderTask|undefined,layer:TextLayer|undefined,page:PDFPageProxy|undefined;
  (async()=>{page=await pdf.getPage(number);if(cancelled)return;const base=page.getViewport({scale:1}),scale=width/base.width,viewport=page.getViewport({scale}),ratio=window.devicePixelRatio||1;setHeight(viewport.height);root.current!.style.setProperty('--scale-factor',String(scale));root.current!.style.setProperty('--total-scale-factor',String(scale));root.current!.style.setProperty('--user-unit','1');
   const target=canvas.current!;target.width=Math.ceil(viewport.width*ratio);target.height=Math.ceil(viewport.height*ratio);target.style.width=viewport.width+'px';target.style.height=viewport.height+'px';text.current!.replaceChildren();
   render=page.render({canvas:target,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0],background:'#ffffff'});await render.promise;if(cancelled)return;
   layer=new TextLayer({textContentSource:page.streamTextContent(),container:text.current!,viewport});await layer.render();if(cancelled)return;layer.textDivs.forEach((element,index)=>{element.dataset.pdfTextIndex=String(index);});
  })().catch(error=>{if(!cancelled)setError(message(error));});
  return()=>{cancelled=true;render?.cancel();layer?.cancel();text.current?.replaceChildren();if(canvas.current){canvas.current.width=0;canvas.current.height=0;}page?.cleanup();};
 },[pdf,number,width,visible]);
 return<div className="pdf-page-wrapper"><div className="page-label">第 {number} 页</div><div className="pdf-page" data-page={number} data-document-id={document.documentId} data-version={document.version} ref={root} style={{width,height}}>{visible?<><canvas ref={canvas}/><div className="textLayer" ref={text}/></>:<div className="page-placeholder">第 {number} 页</div>}{error&&<p className="error">{error}</p>}</div></div>;
}
export function PdfViewer({document,navigation,onReady}:{document:DocumentRecord;navigation:SourceAnchor|null;onReady:()=>void}){
 const root=useRef<HTMLDivElement>(null),[pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[width,setWidth]=useState(600),[aspect,setAspect]=useState(1.414),[error,setError]=useState(''),ready=useRef(onReady);ready.current=onReady;
 useEffect(()=>{const observer=new ResizeObserver(entries=>{const size=entries[0]?.contentRect.width;if(size)setWidth(Math.max(180,size-36));});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{let active=true;const task=getDocument({url:documentUrl(document,'/preview'),withCredentials:true,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',enableXfa:false});task.promise.then(async pdf=>{const page=await pdf.getPage(1),viewport=page.getViewport({scale:1});if(active){setAspect(viewport.height/viewport.width);setPdf(pdf);}}).catch(error=>{if(active)setError(message(error));});return()=>{active=false;setPdf(null);void task.destroy();};},[document.documentId,document.version,document.workspaceId]);
 useEffect(()=>{if(pdf)ready.current();},[pdf]);
 useEffect(()=>{if(pdf&&navigation?.location.kind==='page')root.current?.querySelector('[data-page="'+navigation.location.page+'"]')?.scrollIntoView({block:'start'});},[pdf,navigation]);
 return<div ref={root} className="pdf-viewer">{error&&<p className="error">{error}</p>}{pdf?Array.from({length:pdf.numPages},(_,index)=><PdfPage key={index+1} pdf={pdf} number={index+1} width={width} aspect={aspect} document={document}/>):<div className="reading-loading">正在加载页面…</div>}</div>;
}
