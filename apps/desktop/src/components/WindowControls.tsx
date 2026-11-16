import {useEffect,useState} from "react";
import {X} from "lucide-react";
import {Button} from "./ui/button";
import type {Backend} from "../backend";
export function WindowControls({backend,onError,onCollapse,disabled,label}:{backend:Backend;onError:(value:string)=>void;onCollapse:()=>void;disabled:boolean;label:string}){
 const [maximized,setMaximized]=useState(false);
 useEffect(()=>{document.documentElement.dataset.fileWindow="true";return()=>{delete document.documentElement.dataset.fileWindow;};},[]);
 useEffect(()=>{document.documentElement.dataset.fileMaximized=String(maximized);return()=>{delete document.documentElement.dataset.fileMaximized;};},[maximized]);
 useEffect(()=>{let live=true,dispose:(()=>void)|undefined;void backend.windowState?.().then(v=>{if(live)setMaximized(v);}).catch(e=>onError(String(e)));void backend.subscribeWindowState?.(v=>{if(live)setMaximized(v);}).then(fn=>{if(live)dispose=fn;else fn();}).catch(e=>onError(String(e)));return()=>{live=false;dispose?.();};},[backend]);
 return <div className="window-controls" data-no-window-drag role="group" aria-label="窗口操作"><Button variant="ghost" size="icon" className="window-hide" aria-label={label} disabled={disabled} onClick={onCollapse}><X size={16}/></Button></div>;
}
