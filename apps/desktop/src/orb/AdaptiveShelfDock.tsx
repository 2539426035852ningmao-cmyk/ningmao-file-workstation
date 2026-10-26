import {ScrollActivity} from "../components/ScrollActivity";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {Check,ChevronLeft,ChevronRight,PanelLeftOpen} from "lucide-react";
import type {Backend,DesktopView,EntryPresentation,PeekData} from "../backend";
import {observeTheme,readTheme} from "../preferences";
import {CapsuleClose} from "./CapsuleClose";
import {useWindowDrag} from "./useWindowDrag";
import {OrbFace} from "./OrbFace";
import {QuickPeek} from "./QuickPeek";
import {appearances,appearanceKey,readAppearance,writeAppearance,type OrbAppearance} from "./appearance";

// The capsule has one short status line; full receipts remain in QuickPeek.
function capsuleReceipt(message:string){
  const received=/^已接收 (\d+) 项/.exec(message);
  if(received)return `已接收 ${received[1]} 项`;
  if(message.startsWith("复制完成"))return "复制完成";
  if(message.startsWith("复制任务已开始"))return "正在复制";
  if(message.startsWith("已取消"))return "已取消";
  return "查看任务详情";
}

// Native code owns geometry, the frozen destination and imported paths.
export default function AdaptiveShelfDock({backend}:{backend:Backend}) {
  const [view,setView]=useState<DesktopView|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [appearance,setAppearance]=useState(readAppearance),[settings,setSettings]=useState(false),[peek,setPeek]=useState<PeekData|null>(null),[active,setActive]=useState<number|null>(null);
  const drag=useWindowDrag(()=>backend.desktopMove(),!view?.native_dragging);
  const state=useRef(view);state.current=view;const pending=useRef(false),peekRequest=useRef(0),alive=useRef(true);
  const presentation=view?.presentation??{kind:"orb",shelf_id:null},locked=!!view?.native_dragging,skin=appearances[appearance];
  async function act(action:()=>Promise<void>){if(pending.current)return;pending.current=true;setError("");try{await action();}catch(e){if(alive.current)setError(String(e));}finally{pending.current=false;}}
  function present(id:number,kind:EntryPresentation["kind"]){if(state.current?.native_dragging)return;setSettings(false);void act(()=>backend.desktopPresent(id,kind));}
  function direct(id:number){if(!state.current?.native_dragging)void act(()=>backend.desktopOpen(id));}
  useEffect(()=>observeTheme(theme=>{document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.classList.toggle("light",theme==="light");}),[]);
  useEffect(()=>{document.documentElement.classList.add("desktop-entry-surface",readTheme());alive.current=true;let dispose:(()=>void)|undefined;
    void backend.subscribe({drop:()=>{},hover:()=>{},progress:()=>{},drag:()=>{},desktop:value=>{if(alive.current)setView(value);},near:value=>{if(value.shelf_id!==null)setActive(value.shelf_id);document.querySelectorAll<HTMLElement>("[data-orb-host]").forEach(host=>{const id=Number(host.closest("[data-shelf-id]")?.getAttribute("data-shelf-id"));host.dispatchEvent(new CustomEvent("ningmao-near-pointer",{detail:id===value.shelf_id?value:null}));});},finished:message=>{if(alive.current){if(message.startsWith("复制有错误")){setNotice("");setError(message);}else setNotice(message);}},error:message=>{if(alive.current)setError(message);}}).then(fn=>{if(alive.current)dispose=fn;else fn();}).catch(e=>setError(String(e)));
    void backend.desktopState().then(value=>{if(alive.current)setView(value);}).catch(e=>setError(String(e)));
    const storage=(event:StorageEvent)=>{if(event.key===appearanceKey || event.key===null)setAppearance(readAppearance());};window.addEventListener("storage",storage);
    return()=>{alive.current=false;dispose?.();window.removeEventListener("storage",storage);document.documentElement.classList.remove("desktop-entry-surface");};
  },[backend]);
  useEffect(()=>{const request=++peekRequest.current;setPeek(null);if(presentation.kind!=="quick-peek" || presentation.shelf_id===null)return;void backend.desktopPeek(presentation.shelf_id).then(data=>{if(alive.current && request===peekRequest.current)setPeek(data);}).catch(e=>{if(alive.current && request===peekRequest.current)setError(String(e));});},[backend,presentation.kind,presentation.shelf_id]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key!=="Escape" || state.current?.native_dragging)return;if(settings){setSettings(false);return;}const p=state.current?.presentation;if(p?.shelf_id && p.kind!=="orb"){event.preventDefault();present(p.shelf_id,p.kind==="quick-peek"?"capsule":"orb");}};window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape);},[backend,settings]);
  useEffect(()=>{if(!backend.desktopSense)return;const query=matchMedia("(prefers-reduced-motion: reduce)"),update=()=>{void backend.desktopSense?.(!document.hidden&&!query.matches&&presentation.kind==="orb");};update();document.addEventListener("visibilitychange",update);query.addEventListener("change",update);return()=>{void backend.desktopSense?.(false);document.removeEventListener("visibilitychange",update);query.removeEventListener("change",update);};},[backend,presentation.kind]);
  const warning=error || view?.warning || "";
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),4500);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{if(warning && !locked && presentation.kind==="capsule" && presentation.shelf_id!==null)void backend.desktopPresent(presentation.shelf_id,"quick-peek").catch(()=>{});},[backend,warning,locked,presentation.kind,presentation.shelf_id]);
  const success=notice.startsWith("复制完成") || notice.startsWith("已接收") || notice.startsWith("已处理");
  const geometry=view?.geometry??{width:64,height:(view?.entries.length??1)*56+8+(view && view.total>5?24:0),slots:view?.entries.map((entry,i)=>({id:entry.id,x:8,y:8+i*56,width:48,height:48}))??[]};
  const activeId=active??presentation.shelf_id??view?.entries.find(e=>e.id===view.layout.active_shelf)?.id??view?.entries[0]?.id;
  function changeAppearance(value:OrbAppearance){setAppearance(value);setError(writeAppearance(value));}
  return <nav className={view?.edge_hidden?"desktop-edge-handle":"adaptive-dock"} aria-label="悬浮文件架入口" data-orb-appearance={appearance} data-edge={view?.layout.preferences.edge} data-dragging={locked} data-tone={warning?"error":view?.copying?"working":success?"success":"idle"} style={{"--orb-fill":skin.fill,"--orb-eye":skin.eye,width:view?.edge_hidden?(["top","bottom"].includes(view.layout.preferences.edge)?64:18):geometry.width,height:view?.edge_hidden?(["top","bottom"].includes(view.layout.preferences.edge)?18:64):geometry.height} as CSSProperties} onPointerEnter={()=>{if(!locked)void backend.desktopHover(true).catch(e=>setError(String(e)));}} onPointerLeave={()=>{if(!locked)void backend.desktopHover(false).catch(e=>setError(String(e)));}}>
    <ScrollActivity/>
    {view?.edge_hidden?<button aria-label="唤出贴边文件架" title={warning || "靠近展开，拖入添加文件"} onFocus={()=>{if(!locked)void backend.desktopHover(true);}} onClick={()=>{if(!locked)void backend.desktopHover(true);}}><PanelLeftOpen size={14}/></button>:<>

      {view?.entries.map(entry=>{const mode=presentation.shelf_id===entry.id?presentation.kind:"orb",slot=geometry.slots.find(s=>s.id===entry.id);if(!slot)return null;const semantics=entry.kind==="bound"?"复制到目录 · 保留来源":"仅保存引用";return <section key={entry.id} className="entry-slot" data-shelf-id={entry.id} data-mode={mode} data-target={view.drag_target===entry.id} style={{left:slot.x,top:slot.y,width:slot.width,height:slot.height}}>
        {mode==="quick-peek"?<QuickPeek entry={entry as PeekData["shelf"]} catalog={view.catalog??[]} onOpenOther={direct} onMove={()=>backend.desktopMove()} data={peek} locked={locked} feedback={warning || (locked?`${entry.name} · ${semantics}`:view.copying?"正在复制，来源保留":notice)} error={!!warning} settings={settings} appearance={appearance} onAppearance={changeAppearance} onSettings={()=>setSettings(!settings)} onBack={()=>present(entry.id,"capsule")} onClose={()=>present(entry.id,"orb")} onOpen={()=>direct(entry.id)}/>:<div className="orb-control" data-orb-host data-orb-mode={mode} onPointerEnter={()=>setActive(entry.id)}>
          <button {...drag} className="orb-hit" data-testid={mode==="capsule"?"morph-capsule":undefined} aria-label={mode==="capsule"?`查看 ${entry.name} 轻预览`:`展开 ${entry.name}`} disabled={locked} title={`${entry.name} · ${semantics} · Ctrl+Enter直接打开`} onClick={e=>e.ctrlKey?direct(entry.id):present(entry.id,mode==="orb"?"capsule":"quick-peek")} onKeyDown={e=>{if(e.ctrlKey && e.key==="Enter"){e.preventDefault();direct(entry.id);}}}>
            <span className="orb-body"><OrbFace active={activeId===entry.id && !view.copying && !warning} locked={locked}/>{mode==="capsule" && <span className="capsule-copy"><strong>{entry.name}</strong><small title={warning || (locked?semantics:view.copying?"正在复制，来源保留":notice || semantics)} role={notice?"status":undefined}>{warning?"需要处理":view.copying?"正在复制":!locked && notice?capsuleReceipt(notice):entry.kind==="bound"?"复制到目录":"仅保存引用"}</small></span>}{mode==="capsule" && <ChevronRight className="capsule-arrow" size={16}/>}</span>
            {mode==="orb" && success && <span className="orb-receipt" aria-label={notice}><Check size={12}/></span>}
          </button>
          {mode==="capsule" && <CapsuleClose locked={locked} lower={view.close_lower??false} onClose={()=>present(entry.id,"orb")} onContour={backend.desktopContour}/>}
        </div>}
      </section>;})}
      {view && view.total>5 && <div className="dock-pages"><button aria-label="上一页文件架" disabled={locked || view.layout.page===0} onClick={()=>void act(()=>backend.desktopPage(-1))}><ChevronLeft size={14}/></button><span aria-label="文件架页码">{view.layout.page+1}</span><button aria-label="下一页文件架" disabled={locked || (view.layout.page+1)*5>=view.total} onClick={()=>void act(()=>backend.desktopPage(1))}><ChevronRight size={14}/></button></div>}
    </>}
    {view?.copying && <span className="dock-copying" role="status" aria-label="有复制任务进行中"/>}
    {warning && presentation.kind!=="quick-peek" && <button className="dock-warning" aria-label={warning} title={warning} onClick={()=>{if(activeId)present(activeId,"quick-peek");}}>!</button>}
  </nav>;
}
