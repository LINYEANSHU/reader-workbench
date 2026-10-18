import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

/** Delegation also covers controls rendered in dialogs and floating menus. */
export function ControlTooltip(){
 const id=useId(),[tip,setTip]=useState<{anchor:HTMLElement;text:string}|null>(null),popup=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined,anchor:HTMLElement|null=null;
  const clear=()=>{clearTimeout(timer);anchor=null;setTip(null);};
  const show=(target:EventTarget|null,immediate=false)=>{
   const element=target instanceof Element?target.closest<HTMLElement>('[data-tooltip],button,a[href],select,summary,[role="separator"]'):null;
   if(element===anchor)return;clear();if(!element)return;
   const text=element.closest<HTMLElement>('[data-tooltip]')?.dataset.tooltip??element.getAttribute('title')??element.getAttribute('aria-label')??element.textContent?.trim();
   if(!text)return;anchor=element;timer=setTimeout(()=>setTip({anchor:element,text}),immediate?0:350);
  };
  const over=(event:PointerEvent)=>{if(event.pointerType!=='touch')show(event.target);};
  const out=(event:PointerEvent)=>{if(anchor&&!anchor.contains(event.relatedTarget as Node|null))clear();};
  const focus=(event:FocusEvent)=>show(event.target,true),blur=()=>clear();
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')clear();};
  document.addEventListener('pointerover',over);document.addEventListener('pointerout',out);document.addEventListener('focusin',focus);document.addEventListener('focusout',blur);document.addEventListener('pointerdown',clear);document.addEventListener('keydown',key);document.addEventListener('scroll',clear,true);window.addEventListener('resize',clear);
  return()=>{clearTimeout(timer);document.removeEventListener('pointerover',over);document.removeEventListener('pointerout',out);document.removeEventListener('focusin',focus);document.removeEventListener('focusout',blur);document.removeEventListener('pointerdown',clear);document.removeEventListener('keydown',key);document.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear);};
 },[]);
 useLayoutEffect(()=>{
  if(!tip||!popup.current)return;const node=popup.current,rect=tip.anchor.getBoundingClientRect(),bounds=node.getBoundingClientRect();
  node.style.left=Math.max(8,Math.min(rect.left+(rect.width-bounds.width)/2,window.innerWidth-bounds.width-8))+'px';
  node.style.top=(rect.top>=bounds.height+14?rect.top-bounds.height-8:Math.min(rect.bottom+8,window.innerHeight-bounds.height-8))+'px';
  const previous=tip.anchor.getAttribute('aria-describedby');tip.anchor.setAttribute('aria-describedby',[previous,id].filter(Boolean).join(' '));
  return()=>{if(previous)tip.anchor.setAttribute('aria-describedby',previous);else tip.anchor.removeAttribute('aria-describedby');};
 },[tip,id]);
 return tip&&createPortal(<div id={id} ref={popup} className="control-tooltip" role="tooltip">{tip.text}</div>,document.body);
}
