import {useEffect,useRef,useState,type CSSProperties} from "react";
import {X} from "lucide-react";
export function CapsuleClose({locked,lower,onClose,onContour}:{locked:boolean;lower:boolean;onClose:()=>void;onContour?:(amount:number,lower:boolean)=>Promise<void>}){
 const host=useRef<HTMLDivElement>(null),[amount,setAmount]=useState(0),[active,setActive]=useState(false),anchor=useRef(lower);
 const contourTimer=useRef<ReturnType<typeof setTimeout>|null>(null),latest=useRef({amount,down:lower,locked,moving:false});
 const [moving,setMoving]=useState(false);useEffect(()=>{const fn=(e:Event)=>setMoving(!!(e as CustomEvent<boolean>).detail);window.addEventListener("ningmao-window-motion",fn);return()=>window.removeEventListener("ningmao-window-motion",fn);},[]);
 if(!moving)anchor.current=lower;const down=anchor.current;
 latest.current={amount,down,locked,moving};
 useEffect(()=>{if(locked || moving || contourTimer.current!==null)return;contourTimer.current=setTimeout(()=>{contourTimer.current=null;const value=latest.current;if(!value.locked&&!value.moving)void onContour?.(value.amount,value.down).catch(()=>{});},32);},[amount,down,locked,moving,onContour]);
 useEffect(()=>()=>{if(contourTimer.current!==null)clearTimeout(contourTimer.current);},[]);
 useEffect(()=>{const parent=host.current?.parentElement;if(!parent)return;const point=(e:PointerEvent)=>{if(locked || moving)return;const r=parent.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,cx=r.width-12,cy=down?r.height+2:-2;const distance=Math.hypot(x-cx,y-cy);setAmount(Math.max(0,Math.min(1,(39-distance)/22)));setActive(distance<=8);};const leave=()=>{if(!locked&&!moving){setActive(false);setAmount(0);}};parent.addEventListener("pointermove",point);parent.addEventListener("pointerleave",leave);return()=>{parent.removeEventListener("pointermove",point);parent.removeEventListener("pointerleave",leave);};},[locked,moving,down]);
 return <div ref={host} data-no-window-drag className="capsule-extrusion" data-lower={down} data-active={active&&!locked&&!moving} style={{"--close-growth":amount} as CSSProperties} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}><span className="capsule-neck"/><span className="capsule-bud"/><button className="capsule-close" aria-label="收回圆球" disabled={!active||locked||moving} onClick={onClose}><X size={12}/></button></div>;
}
