import {useEffect,useRef,useState} from "react";
import {Button} from "./ui/button";
import {PeerLink} from "../../../web/src/peer";
import {validInvite,type Invite} from "../../../web/src/guards";
import type {DesktopWebMessage,DesktopWebSignal,TransferBackend} from "../transferBackend";

type Selected={shelf_id:number;files:{id:number;name:string}[]};
type Stage="preparing"|"waiting"|"connecting"|"transmitting"|"confirming";
type Session={id:string;to:string;phase:Stage;controller:AbortController;rtc:PeerLink|null;deadline:ReturnType<typeof setTimeout>|null};
const SIZE_LIMIT=64*1024*1024;

/** Windows -> browser only. Source bytes come from the native window-scoped
 * Store bridge; the remote peer never receives its local ticket or path.
 * The browser must explicitly accept, verify SHA-256 and manually save.
 */
export function DesktopWebOutbox({backend,open,online,peers,selection}:{
  backend:TransferBackend;open:boolean;online:boolean;
  peers:{id:string;name:string}[];selection:Selected;
}){
  const [target,setTarget]=useState("");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [status,setStatus]=useState("选择一个本机文件和在线网页设备，接收方同意后才发送。");
  const [error,setError]=useState("");
  const active=useRef<Session|null>(null);
  const peersRef=useRef(peers);peersRef.current=peers;
  const selectionRef=useRef(selection);selectionRef.current=selection;
  const current=(session:Session)=>active.current===session && !session.controller.signal.aborted;
  const clearSession=(session:Session)=>{
    if(session.deadline!==null){clearTimeout(session.deadline);session.deadline=null;}
    session.controller.abort();
    session.rtc?.close();session.rtc=null;
    if(active.current===session){active.current=null;setBusy(false);}
  };
  const send=async(message:DesktopWebMessage)=>{
    if(!backend.webDeviceSignal)throw new Error("原生 WebSocket 信令不可用");
    await backend.webDeviceSignal(message);
  };
  const stop=(message:string,notify:boolean,failed:boolean)=>{
    const session=active.current;
    if(!session)return;
    const wasInvited=session.phase!=="preparing";
    clearSession(session);
    // Release the in-memory source bytes on reject/error/timeout, too.
    prepared.current=null;
    setStatus(message);
    if(failed)setError(message);
    if(notify && wasInvited)void send({type:"cancel",to:session.to,payload:{id:session.id}}).catch(()=>{});
  };
  const fail=(message:string)=>stop("未完成： "+message,true,true);
  const arm=(session:Session,ms:number,message:string)=>{
    if(session.deadline!==null)clearTimeout(session.deadline);
    session.deadline=setTimeout(()=>{if(current(session))fail(message);},ms);
  };
  const onSignal=(msg:DesktopWebSignal)=>{
    const session=active.current;
    if(!session||!current(session))return;
    if(msg.type==="unavailable"){
      if(msg.to===session.to&&msg.id===session.id)
        fail("目标网页设备已离线，未发送完成");
      return;
    }
    if(msg.from!==session.to||msg.payload?.id!==session.id)return;
    const payload=msg.payload;
    if(msg.type==="cancel"){stop("对方已取消，未确认完成",false,false);return;}
    if(msg.type==="decision" && session.phase==="waiting"){
      if(payload.accepted!==true){stop("接收方已拒绝，本机原文件保持不变",false,false);return;}
      const staged=prepared.current;
      if(!staged||staged.id!==session.id){fail("准备的源文件已失效");return;}
      session.phase="connecting";
      setStatus("对方已接受，正在建立加密数据通道…");
      const rtc=new PeerLink({
        remote:session.to,
        signal:message=>{if(current(session))void send(message).catch(e=>{if(current(session))fail(String(e));});},
        progress:(done,total)=>{
          if(current(session)){setProgress(total?done/total:1);session.phase="transmitting";setStatus("正在通过 WebRTC 发送");}
        },
        transmitted:()=>{
          if(!current(session))return;
          session.phase="confirming";setProgress(1);
          setStatus("字节已发送，等待浏览器校验确认…");
          arm(session,60_000,"等待接收方校验回执超时");
        },
        ready:()=>{if(current(session))fail("发送端不应接收文件数据");},
        error:message=>{if(current(session))fail(message);}
      });
      session.rtc=rtc;
      arm(session,120_000,"无法建立传输连接或等待数据超时");
      void rtc.startSender(staged.bytes,staged.meta).catch(e=>{if(current(session))fail(String(e));});
      prepared.current=null;
      return;
    }
    if((msg.type==="description"||msg.type==="candidate") && session.rtc){
      void session.rtc.handle(msg.type,payload).catch(e=>{if(current(session))fail(String(e));});
      return;
    }
    if(msg.type==="receipt"&&session.phase==="confirming"&&payload.ok===true){
      clearSession(session);
      prepared.current=null;
      setStatus("对方已校验文件；浏览器仍需手动点击保存。");
      setProgress(1);
      setError("");
    }
  };
  const prepared=useRef<{id:string;meta:Invite;bytes:ArrayBuffer}|null>(null);
  const handler=useRef(onSignal);handler.current=onSignal;

  useEffect(()=>{
    if(!open||!online||!backend.subscribeWebSignals)return;
    let disposed=false;
    let unlisten:(()=>void)|undefined;
    void backend.subscribeWebSignals(message=>handler.current(message)).then(stopListening=>{
      if(disposed)stopListening();else unlisten=stopListening;
    }).catch(e=>{if(!disposed)setError(String(e));});
    return()=>{
      disposed=true;unlisten?.();
      if(active.current)stop("面板已关闭或信令已断开，未确认完成",true,false);
      prepared.current=null;
    };
  },[backend,open,online]);

  useEffect(()=>{
    const session=active.current;
    if(session && !peers.some(peer=>peer.id===session.to)){
      stop("目标网页设备已离线，发送未完成",true,true);
      prepared.current=null;
    }
  },[peers]);
  const selectionKey=selection.shelf_id+":"+selection.files.map(f=>f.id).join(",");
  useEffect(()=>{
    if(active.current)stop("文件选择已改变，当前发送已取消",true,false);
    prepared.current=null;
  },[selectionKey]);

  async function start(){
    const chosen=selectionRef.current;
    const id=crypto.randomUUID();
    if(active.current||!open||!online||!backend.webOffer||!backend.webDeviceSignal||
      !backend.subscribeWebSignals||!chosen.shelf_id||chosen.files.length!==1||
      !peersRef.current.some(p=>p.id===target))return;
    const session:Session={id,to:target,phase:"preparing",controller:new AbortController(),rtc:null,deadline:null};
    active.current=session;prepared.current=null;setBusy(true);setProgress(0);setError("");setStatus("正在核验本机文件引用与 SHA-256…");
    try{
      const offer=await backend.webOffer(chosen.shelf_id,chosen.files[0].id,session.controller.signal);
      if(!current(session))return;
      const meta={...offer.manifest,id};
      if(!validInvite(meta)||offer.bytes.byteLength!==meta.size||meta.size>SIZE_LIMIT)
        throw new Error("本机文件清单不符合安全传输协议");
      if(!peersRef.current.some(p=>p.id===session.to))throw new Error("目标设备已离线");
      prepared.current={id,meta,bytes:offer.bytes};
      session.phase="waiting";
      setStatus("邀请已准备，等待网页接收方确认…");
      arm(session,60_000,"对方未在 60 秒内确认接收");
      await send({type:"invite",to:session.to,payload:meta});
    }catch(e){
      if(current(session))fail(String(e));
    }
  }
  function cancel(){
    const session=active.current;
    if(!session)return;
    stop("已取消网页发送，原文件未修改",true,false);
    prepared.current=null;
  }
  const canStart=open&&online&&!!backend.webOffer&&!!backend.webDeviceSignal&&
    !!backend.subscribeWebSignals&&selection.files.length===1&&!!selection.shelf_id&&
    peers.some(peer=>peer.id===target)&&!busy;

  return <details className="transfer-experiment" data-testid="web-outbox-w2-w3">
    <summary>Windows → 网页 / 手机 · 安全发送（W2/W3）</summary>
    <section className="connection-fields" aria-label="Windows 向网页发送">
      <strong>文件架发送至同账号浏览器</strong>
      <p className="muted">只发送当前文件架明确选择的一个普通文件（最多 64 MiB）。先在本机安全读取并核验，再等待网页用户接受；不传远端路径和本机读取票据。</p>
      <label>接收网页设备
        <select aria-label="接收网页设备" value={peers.some(p=>p.id===target)?target:""} onChange={e=>setTarget(e.target.value)} disabled={!online||busy}>
          <option value="">请选择在线网页设备</option>
          {peers.map(peer=><option key={peer.id} value={peer.id}>{peer.name} · {peer.id.slice(0,8)}</option>)}
        </select>
      </label>
      {!peers.length&&<p className="capability-hint">没有其他在线设备。请在受保护的柠猫网页登录同一账号并保持页面打开。</p>}
      {selection.files.length!==1&&<p className="capability-hint">请先在 Windows 文件架选中 1 个普通文件，再启动网页发送。</p>}
      {selection.files.length===1&&<p className="transfer-note">本次文件：{selection.files[0].name}</p>}
      {busy?<Button type="button" variant="outline" onClick={cancel}>取消本次网页发送</Button>:
        <Button type="button" disabled={!canStart} onClick={()=>void start()}>发送到已选网页设备</Button>}
      <p role="status" className="transfer-note">{status}</p>
      {busy&&<progress aria-label="网页发送进度" value={progress} max={1}/>}
      {error&&<p role="alert" className="transfer-error">{error}</p>}
      <p className="muted">“已校验”表示浏览器核验收到的字节，不代表对方已保存到磁盘。本功能仍需 Windows 与手机双真机联调。</p>
    </section>
  </details>;
}
