import {useEffect,useMemo,useRef,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import App from "../App";
import type {Backend} from "../backend";
import {OrbFace} from "../orb/OrbFace";
import {MorphController,type Frame,type Motion} from "./MorphController";
import "./morph-probe.css";

// Opt-in engineering host, not a new file-operation owner or a production Dock.
export default function MorphProbe({backend,native=false}:{backend:Backend;native?:boolean}){
  const [motion,setMotion]=useState<Motion>({width:420,height:520,radius:20,mode:"full",animating:false});
  const [error,setError]=useState(""),[cycles,setCycles]=useState(0),[testing,setTesting]=useState(false),[ready,setReady]=useState(false);
  const host=useRef<HTMLDivElement>(null);
  const controller=useMemo(()=>new MorphController(frame=>native?invoke<Frame>('morph_probe_frame',{frame}):Promise.resolve(frame),setMotion,setError),[native]);
  useEffect(()=>{
    let live=true;
    void (native?invoke<Frame>('morph_probe_begin'):Promise.resolve(controller.full)).then(full=>{if(live){controller.connect(full);setReady(true);}}).catch(e=>setError(String(e)));
    return()=>{live=false;controller.destroy();};
  },[controller,native]);
  const adapted=useMemo<Backend>(()=>({...backend,
    desktopCollapse:async()=>{setError("");await controller.move("capsule");host.current?.focus();},
    subscribe:events=>backend.subscribe({...events,hover:active=>{controller.block(active);events.hover(active);}}),
    drag:async ids=>{controller.block(true);try{return await backend.drag(ids);}finally{controller.block(false);}},
    quit:async()=>{if(await controller.move("full"))await backend.quit();},
  }),[backend,controller]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(!ready||!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();void controller.move(event.key==='ArrowLeft'?'capsule':'full');
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[controller,ready]);
  async function run(){
    setTesting(true);setCycles(0);setError("");
    try{for(let i=1;i<=20;i++){
      for(const mode of ['orb','capsule','full'] as const)if(!await controller.move(mode))throw new Error(controller.lastError||"探针被中断，未计为通过。");
      setCycles(i);
    }
    if(native)await invoke('morph_probe_report');
    }catch(e){setError(String(e));}finally{setTesting(false);}
  }
  const full=motion.mode==='full'&&!motion.animating;
  return <div ref={host} tabIndex={-1} className="morph-probe" data-morph-mode={motion.mode} data-width={motion.width} data-animating={motion.animating} style={{width:motion.width,height:motion.height,borderRadius:motion.radius}}>
    <div className="morph-file-host" inert={!full} aria-hidden={!full} style={{width:controller.full.width,height:controller.full.height,visibility:full?'visible':'hidden'}}>
      <App backend={adapted} native={true} active={full}/>
    </div>
    {!full&&<div className="morph-compact" data-orb-host data-orb-mode={motion.mode}>
      <button className="morph-open" disabled={!ready||testing} aria-label={motion.mode==='orb'?'展开横向工作层':'打开完整文件架'} onClick={()=>void controller.move(motion.mode==='orb'?'capsule':'full')}><OrbFace locked/>{motion.mode!=='orb'&&<span>文件工作站<small>保留当前工作上下文</small></span>}</button>
      {motion.mode==='capsule'&&<button aria-label="收起为悬浮球" disabled={testing} onClick={()=>void controller.move('orb')}>‹</button>}
    </div>}
    {full&&<div className="morph-diagnostics"><button disabled={!ready||testing} onClick={()=>void run()}>运行20次形变探针</button><output role="status" aria-label="形变探针结果">{cycles} / 20</output></div>}
    {error&&<div role="alert" className="morph-error">{error}</div>}
  </div>;
}
