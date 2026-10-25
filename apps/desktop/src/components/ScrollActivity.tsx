import {useEffect} from "react";
export function ScrollActivity(){useEffect(()=>{const selector=".shelf-menu,.file-scroll,.manager-table-scroll,.manager-main,.peek-catalog > div,[data-scroll-surface]",timers=new Map<HTMLElement,ReturnType<typeof setTimeout>>();
 const show=(node:HTMLElement)=>{node.dataset.scrollActive="true";clearTimeout(timers.get(node));timers.set(node,setTimeout(()=>{delete node.dataset.scrollActive;timers.delete(node);},1100));};
 const scroll=(e:Event)=>{if(e.target instanceof HTMLElement && e.target.matches(selector))show(e.target);};
 const move=(e:PointerEvent)=>{const node=(e.target as Element)?.closest<HTMLElement>(selector);if(node && node.scrollHeight>node.clientHeight && e.clientX>=node.getBoundingClientRect().right-18)show(node);};
 document.addEventListener("scroll",scroll,true);document.addEventListener("pointermove",move,{passive:true});return()=>{document.removeEventListener("scroll",scroll,true);document.removeEventListener("pointermove",move);for(const [node,timer] of timers){clearTimeout(timer);delete node.dataset.scrollActive;}};},[]);return null;}
