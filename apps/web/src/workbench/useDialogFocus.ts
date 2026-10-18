import {useEffect,type RefObject} from 'react';

export function useDialogFocus(root:RefObject<HTMLElement|null>,onClose:()=>void,locked=false){
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const focusable=()=>Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')??[]).filter(node=>!node.hidden&&node.getClientRects().length>0);
  (focusable()[0]??root.current)?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();if(!locked)onClose();return;}
   if(event.key!=='Tab')return;
   const nodes=focusable(),first=nodes[0],last=nodes.at(-1);
   if(!first){event.preventDefault();root.current?.focus();return;}
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
 },[root,onClose,locked]);
}
