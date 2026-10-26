import {useEffect,useState} from "react";
import {Minus,Square,Copy,X} from "lucide-react";
import type {Backend} from "../backend";
export function WindowControls({backend,onError}:{backend:Backend;onError:(value:string)=>void}){
 const [maximized,setMaximized]=useState(false);
 useEffect(()=>{document.documentElement.dataset.fileWindow="true";return()=>{delete document.documentElement.dataset.fileWindow;};},[]);
 useEffect(()=>{document.documentElement.dataset.fileMaximized=String(maximized);return()=>{delete document.documentElement.dataset.fileMaximized;};},[maximized]);
 useEffect(()=>{let live=true,dispose:(()=>void)|undefined;void backend.windowState?.().then(v=>{if(live)setMaximized(v);}).catch(e=>onError(String(e)));void backend.subscribeWindowState?.(v=>{if(live)setMaximized(v);}).then(fn=>{if(live)dispose=fn;else fn();}).catch(e=>onError(String(e)));return()=>{live=false;dispose?.();};},[backend]);
 async function act(action:"minimize"|"toggle-maximize"|"hide"){try{setMaximized(await backend.windowAction?.(action)??false);}catch(e){onError(String(e));}}
 return <div className="window-controls" data-no-window-drag role="group" aria-label="窗口操作"><button aria-label="最小化窗口" title="最小化" onClick={()=>void act("minimize")}><Minus size={14}/></button><button aria-label={maximized?"还原窗口":"最大化窗口"} title={maximized?"还原":"最大化"} onClick={()=>void act("toggle-maximize")}>{maximized?<Copy size={13}/>:<Square size={13}/>}</button><button className="window-hide" aria-label="暂时关闭窗口" title="暂时关闭 · 隐藏到托盘" onClick={()=>void act("hide")}><X size={15}/></button></div>;
}
