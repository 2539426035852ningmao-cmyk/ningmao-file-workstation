import {ScrollActivity} from "../components/ScrollActivity";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {Check,ChevronLeft,ChevronRight,PanelLeftOpen} from "lucide-react";
import type {Backend,DesktopView} from "../backend";
import {applyTheme,observeTheme,readTheme} from "../preferences";
import {useWindowDrag} from "./useWindowDrag";
import {OrbFace} from "./OrbFace";
import {themeAppearance} from "./appearance";

// Native code owns geometry, the frozen destination and imported paths.
export default function AdaptiveShelfDock({backend}:{backend:Backend}) {
  const [view,setView]=useState<DesktopView|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [theme,setTheme]=useState(readTheme),[active,setActive]=useState<number|null>(null);
  const drag=useWindowDrag(()=>backend.desktopMove(),!view?.native_dragging);
  const pending=useRef(false),alive=useRef(true),locked=!!view?.native_dragging;
  async function direct(id:number){if(locked||pending.current)return;pending.current=true;setError("");try{await backend.desktopOpen(id);}catch(e){if(alive.current)setError(String(e));}finally{pending.current=false;}}
  useEffect(()=>{applyTheme(theme);},[theme]);
  useEffect(()=>observeTheme(setTheme),[]);
  useEffect(()=>{document.documentElement.classList.add("desktop-entry-surface");alive.current=true;let dispose:(()=>void)|undefined;
    void backend.subscribe({drop:()=>{},hover:()=>{},progress:()=>{},drag:()=>{},desktop:value=>{if(alive.current)setView(value);},near:value=>{if(value.shelf_id!==null)setActive(value.shelf_id);document.querySelectorAll<HTMLElement>("[data-orb-host]").forEach(host=>{const id=Number(host.closest("[data-shelf-id]")?.getAttribute("data-shelf-id"));host.dispatchEvent(new CustomEvent("ningmao-near-pointer",{detail:id===value.shelf_id?value:null}));});},finished:message=>{if(alive.current){if(message.startsWith("复制有错误")){setNotice("");setError(message);}else setNotice(message);}},error:message=>{if(alive.current)setError(message);}}).then(fn=>{if(alive.current)dispose=fn;else fn();}).catch(e=>setError(String(e)));
    void backend.desktopState().then(value=>{if(alive.current)setView(value);}).catch(e=>setError(String(e)));
    return()=>{alive.current=false;dispose?.();document.documentElement.classList.remove("desktop-entry-surface");};
  },[backend]);
  useEffect(()=>{if(!backend.desktopSense)return;const query=matchMedia("(prefers-reduced-motion: reduce)"),update=()=>{void backend.desktopSense?.(!document.hidden&&!query.matches);};update();document.addEventListener("visibilitychange",update);query.addEventListener("change",update);return()=>{void backend.desktopSense?.(false);document.removeEventListener("visibilitychange",update);query.removeEventListener("change",update);};},[backend]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),4500);return()=>clearTimeout(timer);},[notice]);
  const warning=error||view?.warning||"",success=/^(复制完成|已接收|已处理)/.test(notice);
  const geometry=view?.geometry??{width:64,height:(view?.entries.length??1)*56+8,slots:view?.entries.map((entry,i)=>({id:entry.id,x:8,y:8+i*56,width:48,height:48}))??[]};
  const activeId=active??view?.layout.active_shelf??view?.entries[0]?.id;
  return <nav className={view?.edge_hidden?"desktop-edge-handle":"adaptive-dock"} aria-label="悬浮文件架入口" data-orb-appearance={themeAppearance(theme)} data-edge={view?.layout.preferences.edge} data-dragging={locked} data-tone={warning?"error":view?.copying?"working":success?"success":"idle"} style={{width:view?.edge_hidden?(["top","bottom"].includes(view.layout.preferences.edge)?64:18):geometry.width,height:view?.edge_hidden?(["top","bottom"].includes(view.layout.preferences.edge)?18:64):geometry.height} as CSSProperties} onPointerEnter={()=>{if(!locked)void backend.desktopHover(true).catch(e=>setError(String(e)));}} onPointerLeave={()=>{if(!locked)void backend.desktopHover(false).catch(e=>setError(String(e)));}}>
    <ScrollActivity/>
    {view?.edge_hidden?<button aria-label="唤出贴边文件架" onFocus={()=>{if(!locked)void backend.desktopHover(true);}} onClick={()=>{if(!locked)void backend.desktopHover(true);}}><PanelLeftOpen size={14}/></button>:<>
      {view?.entries.map(entry=>{const slot=geometry.slots.find(s=>s.id===entry.id);if(!slot)return null;return <section key={entry.id} className="entry-slot" data-shelf-id={entry.id} data-mode="orb" data-target={view.drag_target===entry.id} style={{left:slot.x,top:slot.y,width:slot.width,height:slot.height}}><div className="orb-control" data-orb-host data-orb-mode="orb" onPointerEnter={()=>setActive(entry.id)}><button {...drag} className="orb-hit" aria-label={"展开 "+entry.name} disabled={locked} onKeyDown={event=>{if(event.ctrlKey&&event.key==="Enter"){event.preventDefault();void direct(entry.id);}}} onClick={()=>void direct(entry.id)}><span className="orb-body"><OrbFace active={activeId===entry.id&&!view.copying&&!warning} locked={locked}/></span>{success&&entry.id===view.layout.active_shelf&&<span className="orb-receipt" role="status" aria-label={notice}><Check size={12}/></span>}</button></div></section>;})}
      {view&&view.total>5&&<div className="dock-pages"><button aria-label="上一页文件架" disabled={locked||view.layout.page===0} onClick={()=>void backend.desktopPage(-1).catch(e=>setError(String(e)))}><ChevronLeft size={14}/></button><span aria-label="文件架页码">{view.layout.page+1}</span><button aria-label="下一页文件架" disabled={locked||(view.layout.page+1)*5>=view.total} onClick={()=>void backend.desktopPage(1).catch(e=>setError(String(e)))}><ChevronRight size={14}/></button></div>}
    </>}
    {view?.copying&&<span className="dock-copying" role="status" aria-label="有复制任务进行中"/>}
    {warning&&<button className="dock-warning" aria-label={warning} onClick={()=>{if(activeId)void direct(activeId);}}>!</button>}
  </nav>;
}
