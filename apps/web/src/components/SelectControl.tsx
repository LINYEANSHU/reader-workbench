import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown,Search} from 'lucide-react';

export interface SelectOption {value:string;label:string;disabled?:boolean;description?:string}
export interface SelectControlProps {
 value:string;options:readonly SelectOption[];onChange:(value:string)=>void;'aria-label':string;
 disabled?:boolean;searchable?:boolean;className?:string;id?:string;
}

/** A controlled single selection. The list lives outside scrolling panels. */
export function SelectControl({value,options,onChange,'aria-label':label,disabled=false,searchable=false,className='',id:providedId}:SelectControlProps){
 const generatedId=useId(),id=providedId??generatedId,listId=id+'-list';
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(value);
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),typeahead=useRef({text:'',time:0});
 const visible=options.filter(option=>!query||[option.label,option.description??''].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const enabled=visible.filter(option=>!option.disabled),selected=options.find(option=>option.value===value),activeIndex=visible.findIndex(option=>option.value===active);
 const close=(restore=false)=>{setOpen(false);setQuery('');if(restore)trigger.current?.focus({preventScroll:true});};
 const show=()=>{if(disabled)return;setQuery('');setActive(options.find(option=>option.value===value&&!option.disabled)?.value??options.find(option=>!option.disabled)?.value??'');setOpen(true);};
 const commit=(next:SelectOption)=>{if(next.disabled)return;onChange(next.value);close(true);};
 useEffect(()=>{if(disabled)close();},[disabled]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close();};
  window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);
 },[open]);
 useLayoutEffect(()=>{
  if(!open)return;const element=popup.current,anchor=trigger.current;if(!element||!anchor)return;
  const position=()=>{
   const rect=anchor.getBoundingClientRect(),width=Math.min(Math.max(rect.width,180),window.innerWidth-16);
   element.style.width=width+'px';element.style.maxHeight=Math.max(100,Math.min(360,window.innerHeight-16))+'px';
   const height=element.getBoundingClientRect().height,below=window.innerHeight-rect.bottom-8,above=rect.top-8;
   const useBelow=below>=height||below>=above,available=Math.max(80,useBelow?below:above);
   element.style.maxHeight=Math.min(360,available)+'px';
   const finalHeight=element.getBoundingClientRect().height;
   element.style.top=Math.max(8,Math.min(useBelow?rect.bottom+6:rect.top-finalHeight-6,window.innerHeight-finalHeight-8))+'px';
   element.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
  };
  position();(searchable?search.current:list.current)?.focus({preventScroll:true});
  const observer=new ResizeObserver(position);observer.observe(anchor);observer.observe(element);
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[open,searchable]);
 useEffect(()=>{if(open&&activeIndex>=0)list.current?.children[activeIndex]?.scrollIntoView({block:'nearest'});},[open,activeIndex]);
 const keydown=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(event.key==='Tab'){close(true);return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const index=enabled.findIndex(option=>option.value===active);
   const next=event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):enabled[(index+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length];if(next)setActive(next.value);return;
  }
  if(event.key==='Enter'||(event.key===' '&&!searchable)){event.preventDefault();const option=enabled.find(option=>option.value===active);if(option)commit(option);return;}
  if(!searchable&&event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   const now=Date.now();typeahead.current={text:(now-typeahead.current.time<700?typeahead.current.text:'')+event.key.toLocaleLowerCase(),time:now};
   const match=enabled.find(option=>option.label.toLocaleLowerCase().startsWith(typeahead.current.text));if(match)setActive(match.value);
  }
 };
 const activeId=activeIndex>=0?listId+'-'+activeIndex:undefined;
 return<>
  <button ref={trigger} id={id} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} data-value={value} disabled={disabled} className={'select-trigger '+className} onClick={()=>open?close():show()} onKeyDown={event=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();show();}}}>
   <span>{selected?.label??'请选择'}</span><ChevronDown size={13} aria-hidden="true"/>
  </button>
  {open&&createPortal(<div ref={popup} className="select-popover" style={{top:8,left:8}} onKeyDown={keydown} onBlur={event=>{if(!popup.current?.contains(event.relatedTarget as Node)&&!trigger.current?.contains(event.relatedTarget as Node))close();}}>
   {searchable&&<div className="select-search"><Search size={14} aria-hidden="true"/><input ref={search} type="text" aria-label={'搜索'+label} aria-controls={listId} aria-activedescendant={activeId} placeholder="输入名称筛选" value={query} onChange={event=>{const next=event.target.value;setQuery(next);setActive(options.find(option=>!option.disabled&&[option.label,option.description??''].join(' ').toLocaleLowerCase().includes(next.toLocaleLowerCase()))?.value??'');}}/></div>}
   <div ref={list} id={listId} role="listbox" aria-label={label} tabIndex={searchable?undefined:-1} aria-activedescendant={activeId} className="select-options">
    {visible.map((option,index)=><button type="button" role="option" id={listId+'-'+index} key={option.value} data-value={option.value} aria-selected={option.value===value} aria-disabled={option.disabled||undefined} disabled={option.disabled} tabIndex={-1} className={'select-option '+(option.value===active?'active':'')} onPointerMove={()=>{if(!option.disabled)setActive(option.value);}} onMouseDown={event=>event.preventDefault()} onClick={()=>commit(option)}><span><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</span>{option.value===value&&<Check size={14} aria-hidden="true"/>}</button>)}
   </div>{!visible.length&&<p className="select-empty" role="status">没有匹配的选项</p>}
  </div>,document.body)}
 </>;
}
