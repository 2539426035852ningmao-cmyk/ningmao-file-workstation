import {useRef,type PointerEvent as ReactPointerEvent,type MouseEvent as ReactMouseEvent} from "react";
export function useWindowDrag(move:()=>Promise<void>,enabled=true){
 const point=useRef<{x:number;y:number;id:number}|null>(null),started=useRef(false),suppress=useRef(false);
 const lock=(value:boolean)=>{document.documentElement.dataset.windowMoving=String(value);window.dispatchEvent(new CustomEvent("ningmao-window-motion",{detail:value}));};
 return {
  onPointerDown:(e:ReactPointerEvent<HTMLElement>)=>{suppress.current=false;const target=e.target as Element;if(!enabled || e.button!==0 || !e.currentTarget.contains(target) || target.closest("[data-no-window-drag],input,select,a,[role=button]") || (target.closest("button") && target.closest("button")!==e.currentTarget))return;point.current={x:e.clientX,y:e.clientY,id:e.pointerId};started.current=false;suppress.current=false;e.currentTarget.setPointerCapture(e.pointerId);},
  onPointerMove:(e:ReactPointerEvent<HTMLElement>)=>{const p=point.current;if(!p || started.current || !(e.buttons&1) || Math.hypot(e.clientX-p.x,e.clientY-p.y)<5)return;started.current=true;suppress.current=true;lock(true);if(e.currentTarget.hasPointerCapture(p.id))e.currentTarget.releasePointerCapture(p.id);void move().catch(()=>{}).finally(()=>lock(false));},
  onPointerUp:()=>{point.current=null;},onPointerCancel:()=>{point.current=null;},
  onClickCapture:(e:ReactMouseEvent<HTMLElement>)=>{if(suppress.current){e.preventDefault();e.stopPropagation();}},
 };
}
