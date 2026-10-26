import {useEffect,useState} from "react";
import {Archive,ChevronLeft,ChevronRight,Folder,GripHorizontal,PanelLeftOpen} from "lucide-react";
import type {Backend,DesktopView} from "./backend";
import {observeTheme,readTheme} from "./preferences";

// Native DragDropEvent owns file paths and the frozen destination; HTML never imports.
export default function DesktopEntry({backend}:{backend:Backend}) {
  const [view,setView]=useState<DesktopView|null>(null),[error,setError]=useState("");
  useEffect(()=>observeTheme(theme=>{document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.classList.toggle("light",theme==="light");}),[]);
  useEffect(()=>{document.documentElement.classList.add("desktop-entry-surface",readTheme());let live=true,dispose:(()=>void)|undefined;
    void backend.subscribe({drop:()=>{},hover:()=>{},progress:()=>{},finished:()=>{},drag:()=>{},desktop:value=>{if(live)setView(value);},error:message=>{if(live)setError(message);}}).then(fn=>{if(live)dispose=fn;else fn();}).catch(e=>setError(String(e)));
    void backend.desktopState().then(value=>{if(live)setView(value);}).catch(e=>setError(String(e)));
    return()=>{live=false;dispose?.();document.documentElement.classList.remove("desktop-entry-surface");};
  },[backend]);
  async function act(action:()=>Promise<void>){setError("");try{await action();}catch(e){setError(String(e));}}
  const warning=error || view?.warning || "";
  return <nav className={view?.edge_hidden?"desktop-edge-handle":"desktop-dock"} aria-label="悬浮文件架入口" onPointerEnter={()=>void act(()=>backend.desktopHover(true))} onPointerLeave={()=>void backend.desktopHover(false).catch(e=>setError(String(e)))}>
    {view?.edge_hidden?<button aria-label="唤出贴边文件架" title={warning || "靠近展开，拖入添加文件"} onFocus={()=>void act(()=>backend.desktopHover(true))} onClick={()=>void act(()=>backend.desktopHover(true))}><PanelLeftOpen size={14}/></button>:<>
    <button className="dock-grip" title={warning || (view?.layout.preferences.edge==="free"?"按住移动悬浮入口":"在管理中心切换自由悬浮后移动")} disabled={view?.layout.preferences.edge!=="free"} aria-label="移动悬浮入口" onPointerDown={e=>{if(e.button===0)void act(()=>backend.desktopMove());}}><GripHorizontal size={16}/></button>
    {view?.entries.map(entry=><button key={entry.id} className="dock-orb" data-active={view.layout.active_shelf===entry.id} title={`${entry.name} · 点击展开，拖入添加${entry.kind==="bound"?"副本":"引用"}${warning?` · ${warning}`:""}`} aria-label={`展开 ${entry.name}`} onClick={()=>void act(()=>backend.desktopOpen(entry.id))}>{entry.kind==="bound"?<Folder size={21}/>:<Archive size={21}/>}<span>{entry.name.slice(0,2)}</span></button>)}
    {view && view.total>5 && <div className="dock-pages"><button aria-label="上一页文件架" disabled={view.layout.page===0} onClick={()=>void act(()=>backend.desktopPage(-1))}><ChevronLeft size={14}/></button><span aria-label="文件架页码">{view.layout.page+1}</span><button aria-label="下一页文件架" disabled={(view.layout.page+1)*5>=view.total} onClick={()=>void act(()=>backend.desktopPage(1))}><ChevronRight size={14}/></button></div>}
    </>}{view?.copying && <span className="dock-copying" role="status" aria-label="有复制任务进行中"/>}
    {warning && <span className="dock-warning" role="alert" title={warning}>!</span>}
  </nav>;
}
