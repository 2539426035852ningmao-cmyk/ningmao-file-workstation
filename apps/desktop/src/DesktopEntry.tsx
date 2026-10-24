import {useEffect,useState} from "react";
import {Archive,ChevronLeft,ChevronRight,Folder,GripHorizontal} from "lucide-react";
import type {Backend,DesktopView} from "./backend";
import {readTheme} from "./preferences";

// Files enter through native DragDropEvent in Rust, never DOM paths or HTML drop.
export default function DesktopEntry({backend}:{backend:Backend}) {
  const [view,setView]=useState<DesktopView|null>(null),[error,setError]=useState("");
  useEffect(()=>{document.documentElement.classList.add("desktop-entry-surface",readTheme());let live=true,dispose:(()=>void)|undefined;
    void backend.subscribe({drop:()=>{},hover:()=>{},progress:()=>{},finished:()=>{},drag:()=>{},desktop:value=>{if(live)setView(value);},error:message=>{if(live)setError(message);}}).then(fn=>{if(live)dispose=fn;else fn();}).catch(e=>setError(String(e)));
    void backend.desktopState().then(value=>{if(live)setView(value);}).catch(e=>setError(String(e)));
    return()=>{live=false;dispose?.();document.documentElement.classList.remove("desktop-entry-surface");};
  },[backend]);
  async function act(action:()=>Promise<void>){setError("");try{await action();}catch(e){setError(String(e));}}
  const warning=error || view?.warning || "";
  return <nav className="desktop-dock" aria-label="悬浮文件架入口">
    <button className="dock-grip" title={warning || "按住移动悬浮入口"} aria-label="移动悬浮入口" onPointerDown={e=>{if(e.button===0)void act(()=>backend.desktopMove());}}><GripHorizontal size={16}/></button>
    {view?.entries.map(entry=><button key={entry.id} className="dock-orb" data-active={view.layout.active_shelf===entry.id} title={`${entry.name} · 点击展开，拖入添加${entry.kind==="bound"?"副本":"引用"}${warning?` · ${warning}`:""}`} aria-label={`展开 ${entry.name}`} onClick={()=>void act(()=>backend.desktopOpen(entry.id))}>{entry.kind==="bound"?<Folder size={21}/>:<Archive size={21}/>}<span>{entry.name.slice(0,2)}</span></button>)}
    {view && view.total>5 && <div className="dock-pages"><button aria-label="上一页文件架" disabled={view.layout.page===0} onClick={()=>void act(()=>backend.desktopPage(-1))}><ChevronLeft size={14}/></button><span aria-label="文件架页码">{view.layout.page+1}</span><button aria-label="下一页文件架" disabled={(view.layout.page+1)*5>=view.total} onClick={()=>void act(()=>backend.desktopPage(1))}><ChevronRight size={14}/></button></div>}
    {warning && <span className="dock-warning" role="alert" title={warning}>!</span>}
  </nav>;
}
