import {useEffect} from "react";
export function ScrollActivity(){useEffect(()=>{const selector=".shelf-menu,.file-scroll,.manager-table-scroll,.manager-main,.peek-catalog > div,[data-scroll-surface],.centered-panel,.preview-scroll,.global-search-results,.chat-messages,.transfer-body",timers=new Map<HTMLElement,ReturnType<typeof setTimeout>>();
 const show=(node:HTMLElement)=>{node.dataset.scrollActive="true";clearTimeout(timers.get(node));timers.set(node,setTimeout(()=>{delete node.dataset.scrollActive;timers.delete(node);},1100));};
 const scroll=(e:Event)=>{if(e.target instanceof HTMLElement && e.target.matches(selector))show(e.target);};
 let edge:HTMLElement|null=null;
 const setEdge=(next:HTMLElement|null)=>{if(next!==edge){if(edge)delete edge.dataset.scrollEdge;edge=next;if(edge)edge.dataset.scrollEdge="true";}};
 const move=(e:PointerEvent)=>{
   const target=e.target instanceof Element?e.target:null;
   const preview=target?.closest(".file-preview-dialog")?.querySelector<HTMLElement>(".preview-scroll");
   if(preview){
     const rect=preview.getBoundingClientRect();
     setEdge(preview.scrollHeight>preview.clientHeight&&e.clientX>=rect.right-12&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom?preview:null);
     return;
   }
   setEdge(null);
   const node=target?.closest<HTMLElement>(selector);
   if(node && (node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth))show(node);
 };
 const leave=(event:PointerEvent)=>{if(!event.relatedTarget)setEdge(null);};
 document.addEventListener("scroll",scroll,true);document.addEventListener("pointermove",move,{passive:true});document.addEventListener("pointerout",leave);return()=>{document.removeEventListener("scroll",scroll,true);document.removeEventListener("pointermove",move);document.removeEventListener("pointerout",leave);setEdge(null);for(const [node,timer] of timers){clearTimeout(timer);delete node.dataset.scrollActive;}};},[]);return null;}
