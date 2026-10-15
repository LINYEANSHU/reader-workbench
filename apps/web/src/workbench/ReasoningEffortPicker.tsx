import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {Brain,ChevronDown} from 'lucide-react';

export function ReasoningEffortPicker({levels,value,onChange,kind}:{levels:string[];value:string;onChange:(value:string)=>void;kind:'main'|'temporary'}){
 const [open,setOpen]=useState(false);
 const id=useId(),button=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const index=Math.max(0,levels.indexOf(value)),progress=index/(levels.length-1);
 const style={'--effort-position':`calc(${progress*100}% + ${14-progress*28}px)`} as CSSProperties;

 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!popup.current?.contains(event.target as Node)&&!button.current?.contains(event.target as Node))setOpen(false);};
  window.addEventListener('pointerdown',outside);
  return()=>window.removeEventListener('pointerdown',outside);
 },[open]);

 useLayoutEffect(()=>{
  if(!open)return;
  const element=popup.current,anchor=button.current;
  if(!element||!anchor)return;
  const position=()=>{
   element.style.maxHeight=Math.max(0,window.innerHeight-16)+'px';
   const rect=anchor.getBoundingClientRect(),bounds=element.getBoundingClientRect();
   const top=rect.top-bounds.height-8;
   element.style.top=Math.max(8,Math.min(top>=8?top:rect.bottom+8,window.innerHeight-bounds.height-8))+'px';
   element.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-bounds.width-8))+'px';
  };
  position();input.current?.focus({preventScroll:true});
  const observer=new ResizeObserver(position);observer.observe(element);observer.observe(anchor);
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[open]);

 return<>
  <button ref={button} type="button" className="effort-trigger" aria-label="选择思考强度" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} title={'思考强度：'+value} onClick={()=>setOpen(current=>!current)}><Brain size={13} aria-hidden="true"/><span>{value}</span><ChevronDown size={12} aria-hidden="true"/></button>
  {open&&createPortal(<div ref={popup} id={id} role="dialog" aria-label="思考强度" className={'effort-popover '+kind} style={{top:8,left:8}} onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);button.current?.focus();}
   if(event.key==='Tab'){setOpen(false);button.current?.focus();}
  }} onBlur={event=>{if(!popup.current?.contains(event.relatedTarget as Node)&&!button.current?.contains(event.relatedTarget as Node))setOpen(false);}}>
   <span className="effort-slider" style={style}>
    <span className="effort-slider-control">
     <span className="effort-track" aria-hidden="true"><span className="effort-fill"/></span>
     <input ref={input} className="effort-range" type="range" aria-label="思考强度" aria-valuetext={value} min={0} max={levels.length-1} step={1} value={index} onChange={event=>{const level=levels[Number(event.target.value)];if(level)onChange(level);}}/>
     <span className="effort-knob" aria-hidden="true"/>
    </span>
    <span className="effort-slider-labels" aria-hidden="true">{levels.map(level=><span className={value===level?'selected':''} key={level}>{level}</span>)}</span>
   </span>
  </div>,document.body)}
 </>;
}
