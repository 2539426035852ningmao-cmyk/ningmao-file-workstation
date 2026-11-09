import {useEffect,useRef,useState} from "react";
import {Button} from "./ui/button";
import {PeerLink} from "../../../web/src/peer";
import {validInvite,type Invite} from "../../../web/src/guards";
import {saveAcceptedWebFile} from "../webReceiveBackend";
import type {Shelf} from "../backend";
import type {DesktopWebMessage,DesktopWebSignal,TransferBackend} from "../transferBackend";

type Pending={from:string;meta:Invite};
type Active={from:string;id:string;shelf:number};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const size=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+" MB":n>=1024?(n/1024).toFixed(1)+" KB":n+" B";

/** Only handles browser -> Windows once the user enables receiving and selects a bound shelf.
 * Tauri owns the authenticated WSS credential, and only sends validated RTC signals to JS.
 * WebRTC bytes are independently hashed, then reverified and persisted through native Store.
 */
export function DesktopWebInbox({backend,open,online,peers,shelves}:{
  backend:TransferBackend;open:boolean;online:boolean;
  peers:{id:string;name:string}[];shelves:Shelf[];
}){
  const [enabled,setEnabled]=useState(false);
  const [pending,setPending]=useState<Pending|null>(null);
  const [destination,setDestination]=useState(0);
  const [status,setStatus]=useState("请先允许网页请求，收到文件时由你选择保存位置。");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState("");
  const details=useRef<HTMLDetailsElement>(null);
  const canReceive=useRef(false);
  const incoming=useRef<Pending|null>(null);
  const active=useRef<Active|null>(null);
  const rtc=useRef<PeerLink|null>(null);
  const cancelSource=useRef<AbortController|null>(null);
  const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
  const peersRef=useRef(peers);
  peersRef.current=peers;

  const clearDeadline=()=>{if(deadline.current)clearTimeout(deadline.current);deadline.current=null;};
  const send=async(message:DesktopWebMessage)=>{
    if(!backend.webDeviceSignal)throw new Error("工作站信令接口尚未连接");
    await backend.webDeviceSignal(message);
  };
  const cleanup=()=>{
    clearDeadline();
    rtc.current?.close();rtc.current=null;
    cancelSource.current?.abort();cancelSource.current=null;
    active.current=null;
    incoming.current=null;
    setPending(null);
    setBusy(false);
    setProgress(0);
  };
  const reject=async(request:Pending)=>{
    await send({type:"decision",to:request.from,payload:{id:request.meta.id,accepted:false}});
  };
  const fail=(message:string)=>{
    const old=active.current;
    cleanup();
    setError(message);
    setStatus("接收失败 · 未确认文件已保存");
    if(old)void send({type:"cancel",to:old.from,payload:{id:old.id}}).catch(()=>{});
  };

  async function saved(blob:Blob,meta:Invite){
    const session=active.current;
    if(!session || session.id!==meta.id)return;
    try{
      setStatus("SHA-256 已核验，正在安全保存到选定文件架…");
      const bytes=await blob.arrayBuffer();
      if(cancelSource.current?.signal.aborted)return;
      const result=await saveAcceptedWebFile(session.shelf,{manifest:meta,bytes},cancelSource.current?.signal);
      if(active.current!==session)return;
      setStatus("已保存到 Windows 文件架："+result.file_name+" · "+size(result.bytes)+" · 任务 #"+result.job_id);
      await send({type:"receipt",to:session.from,payload:{id:session.id,ok:true,persisted:true}});
      cleanup();
    }catch(e){if(active.current===session)fail(String(e));}
  }
  const onSignal=(msg:DesktopWebSignal)=>{
    if(msg.type==="unavailable"){
      if(active.current?.id===msg.id)fail("目标设备已离线");return;
    }
    if(!msg.from || !UUID.test(msg.from))return;
    const p=msg.payload??{};
    if(msg.type==="invite"){
      if(!validInvite(p))return;
      const request={from:msg.from,meta:p};
      if(!canReceive.current||!peersRef.current.some(peer=>peer.id===msg.from)||
        active.current||incoming.current){
        void reject(request).catch(()=>{});
        return;
      }
      incoming.current=request;
      setPending(request);
      setError("");
      setStatus("收到网页文件请求 · 尚未同意或创建本机文件");
      if(details.current)details.current.open=true;
      clearDeadline();
      deadline.current=setTimeout(()=>{
        if(incoming.current?.meta.id===request.meta.id){
          incoming.current=null;setPending(null);
          setStatus("请求超过 60 秒未处理，已拒收");
          void reject(request).catch(()=>{});
        }
      },60_000);
      return;
    }
    const session=active.current;
    if(!session||session.from!==msg.from||session.id!==p.id)return;
    if(msg.type==="cancel"){
      cleanup();setStatus("对方已取消，未确认本机保存");return;
    }
    if(msg.type==="description"||msg.type==="candidate"){
      void rtc.current?.handle(msg.type,p).catch(e=>fail(String(e)));
    }
  };
  const handler=useRef(onSignal);
  handler.current=onSignal;
  useEffect(()=>{
    if(!open||!online||!backend.subscribeWebSignals)return;
    let stopped=false,unlisten:(()=>void)|undefined;
    void backend.subscribeWebSignals(msg=>handler.current(msg)).then(fn=>{
      if(stopped)fn();else unlisten=fn;
    }).catch(e=>{if(!stopped)setError(String(e));});
    return()=>{
      stopped=true;unlisten?.();
      canReceive.current=false;
      void backend.webDeviceSetReceiving?.(false).catch(()=>{});
      cleanup();
    };
  },[backend,open,online]);

  async function toggle(){
    if(!backend.webDeviceSetReceiving||busy)return;
    try{
      const next=!canReceive.current;
      await backend.webDeviceSetReceiving(next);
      canReceive.current=next;setEnabled(next);
      if(!next){
        if(incoming.current)void reject(incoming.current).catch(()=>{});
        cleanup();
      }
      setStatus(next?"正在等待同账号网页发来请求（不会自动接收）":"网页接收已关闭");
      setError("");
    }catch(e){setError("更改接收授权失败："+String(e));}
  }
  async function decide(accepted:boolean){
    const request=incoming.current;
    if(!request)return;
    clearDeadline();
    incoming.current=null;setPending(null);
    if(!accepted){
      await reject(request).catch(e=>setError(String(e)));
      setStatus("你已拒绝网页文件，本机没有创建新文件");
      return;
    }
    if(!canReceive.current||!destination||!shelves.some(s=>s.id===destination&&s.kind==="bound"&&s.available)){
      setError("请先选择已绑定且可用的保存文件架");
      incoming.current=request;setPending(request);
      return;
    }
    if(active.current)return;
    const session={from:request.from,id:request.meta.id,shelf:destination};
    const abort=new AbortController();
    cancelSource.current=abort;
    active.current=session;setBusy(true);setProgress(0);setError("");
    try{
      const link=new PeerLink({
        remote:session.from,
        signal:message=>{void send(message).catch(e=>fail(String(e)));},
        ready:(blob,manifest)=>{void saved(blob,manifest);},
        progress:(received,total)=>setProgress(total?received/total:0),
        transmitted:()=>{},
        error:fail
      });
      rtc.current=link;
      link.prepareReceiver(request.meta);
      await send({type:"decision",to:session.from,payload:{id:session.id,accepted:true}});
      setStatus("已同意，等待 WebRTC 数据并核验 SHA-256…");
      deadline.current=setTimeout(()=>{if(active.current===session)fail("等待数据超时或设备无法直连");},120_000);
    }catch(e){fail(String(e));}
  }
  async function cancel(){
    if(incoming.current){
      const request=incoming.current;
      incoming.current=null;setPending(null);clearDeadline();
      await reject(request).catch(()=>{});
      setStatus("已拒收，本机文件未被修改");
    }
    if(active.current){
      const session=active.current;
      cleanup();
      await send({type:"cancel",to:session.from,payload:{id:session.id}}).catch(()=>{});
      setStatus("已取消，临时接收已停止");
    }
  }
  return <details ref={details} className="transfer-experiment" data-testid="web-inbox-w2-w3">
    <summary>网页 → Windows 文件安全接收（W2/W3）</summary>
    <section className="connection-fields" aria-label="网页文件安全接收">
      <strong>同账号文件请求 · 先确认，再落盘</strong>
      <p className="muted">通过已授权的原生信令和浏览器 WebRTC 接收。必须手动开启、选定已绑定文件架并确认文件；不接收远端路径。单个文件最大 64 MiB。</p>
      <Button type="button" variant="outline" disabled={!online||busy} onClick={()=>void toggle()}>
        {enabled?"关闭网页接收授权":"允许网页发送请求（仅当前面板）"}
      </Button>
      {enabled&&<p role="status" className="transfer-note">已开启接收请求 · 不代表自动接受文件</p>}
      {pending&&<section className="transfer-status" aria-label="等待用户确认的网页文件">
        <strong>来自 {peers.find(p=>p.id===pending.from)?.name??"同账号网页设备"}</strong>
        <p>{pending.meta.name} · {size(pending.meta.size)}</p>
        <label>保存到已绑定文件架<select aria-label="网页文件保存架" value={destination} onChange={e=>setDestination(Number(e.target.value))}>
          <option value={0}>请选择保存文件架</option>
          {shelves.filter(s=>s.kind==="bound"&&s.available).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <div><Button type="button" variant="outline" onClick={()=>void decide(false)}>拒绝网页文件</Button>
        <Button type="button" disabled={!destination} onClick={()=>void decide(true)}>确认接收并保存</Button></div>
      </section>}
      {busy&&<div role="status"><p>{status}</p><progress max={1} value={progress}/><Button type="button" variant="outline" onClick={()=>void cancel()}>取消当前网页传输</Button></div>}
      {!busy&&<p role="status" className="transfer-note">{status}</p>}
      {error&&<p role="alert" className="transfer-error">{error}</p>}
    </section>
  </details>;
}
