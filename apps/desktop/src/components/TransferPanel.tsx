import {useEffect,useRef,useState} from "react";
import {X} from "lucide-react";
import {DesktopWebInbox} from "./DesktopWebInbox";
import {DesktopWebOutbox} from "./DesktopWebOutbox";
import {Button} from "./ui/button";
import {Input} from "./ui/input";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "./ui/tabs";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "./ui/sheet";
import type {Shelf} from "../backend";
import type {NearbyDevice,TransferBackend,TransferProgress,TransferResult,TransferView,WebDeviceStatus,WebSourceInfo} from "../transferBackend";

const empty:TransferView={receiving:false,address:null,fingerprint:null,shelf_id:null,pending:null,sending:false};
const sizes=(n:number)=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:n>=1024?`${(n/1024).toFixed(1)} KB`:`${n} B`;
const phases:Record<string,string>={preparing:"准备中",waiting:"等待接收确认",sending:"发送中",terminal:"正在核对结果"};
const statuses:Record<string,string>={completed:"已完成",cancelled:"已取消",partial:"部分完成",failed:"发送失败",interrupted:"传输中断，需核对接收结果",rejected:"已拒绝",not_sent:"未发送"};
export type TransferSelection={shelf_id:number;files:{id:number;name:string}[]};

export function TransferPanel({backend,open,onOpenChange,initialMode,selection,shelves,chooseReceiveFolder}:{backend:TransferBackend;open:boolean;onOpenChange:(value:boolean)=>void;initialMode:"send"|"receive";selection:TransferSelection;shelves:Shelf[];chooseReceiveFolder?:()=>Promise<number|null>}){
  const [mode,setMode]=useState(initialMode),[view,setView]=useState(empty),[error,setError]=useState("");
  const content=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(open&&mode==="receive")content.current?.scrollTo(0,0);},[open,mode,view.receiving]);
  // The fixed error band reduces the viewport; keep the correction field visible.
  useEffect(()=>{if(error)content.current?.querySelector<HTMLElement>(":focus")?.scrollIntoView({block:"nearest"});},[error]);
  const [copied,setCopied]=useState("");
  const [connection,setConnection]=useState("");
  const [known,setKnown]=useState<string[]>([]);
  useEffect(()=>{if(open&&backend.peers)void backend.peers().then(peers=>setKnown(peers.map(peer=>peer.fingerprint))).catch(e=>setError(String(e)));},[backend,open]);
  const [devices,setDevices]=useState<NearbyDevice[]>([]),[finding,setFinding]=useState(false),[deviceName,setDeviceName]=useState("");
  async function findDevices(){if(!backend.devices||finding)return;setFinding(true);setError("");try{setDevices(await backend.devices());}catch(e){setError(String(e));}finally{setFinding(false);}}
  useEffect(()=>{if(open&&mode==="send")void findDevices();},[open,mode]);
  function importConnection(text:string){
    setConnection(text);setDeviceName("");setError("");
    if(!text.trim())return;
    try{const url=new URL(text.trim());const addr=url.searchParams.get("address")??"",pin=url.searchParams.get("fingerprint")??"";
      if(url.protocol!=="ningmao:"||url.hostname!=="receive"||!addr||addr.length>80||!/^[a-fA-F0-9]{64}$/.test(pin))throw Error();
      setAddress(addr);setFingerprint(pin);
    }catch{setAddress("");setFingerprint("");setError("这条连接信息不完整，请对方重新复制。也可以展开手动连接。");}
  }
  const [webSource,setWebSource]=useState<WebSourceInfo|null>(null),[webChecking,setWebChecking]=useState(false);
  const choiceKey=`${selection.shelf_id}:${selection.files.map(f=>f.id).join(",")}`;
  useEffect(()=>setWebSource(null),[choiceKey,open]);
  async function checkWebSource(){
    if(webChecking||!backend.webSourceInfo||selection.files.length!==1||!selection.shelf_id)return;
    setWebChecking(true);setError("");setWebSource(null);
    try{const value=await backend.webSourceInfo(selection.shelf_id,selection.files[0].id);setWebSource(value);}
    catch(e){setError(`Web 文件源预检失败：${String(e)}`);}
    finally{setWebChecking(false);}
  }
  const [webEndpoint,setWebEndpoint]=useState(""),[webPairCode,setWebPairCode]=useState("");
  const [webDevice,setWebDevice]=useState<WebDeviceStatus|null>(null);
  const [webPairBusy,setWebPairBusy]=useState(false),[webPairNotice,setWebPairNotice]=useState("");
  useEffect(()=>{
    if(!open||!webDevice?.authorized||!backend.webDeviceStatus)return;
    const timer=setInterval(()=>{
      void backend.webDeviceStatus?.().then(value=>setWebDevice(value)).catch(()=>{});
    },4000);
    return()=>clearInterval(timer);
  },[open,backend,webDevice?.authorized]);
  useEffect(()=>{
    if(!open||!backend.webDeviceStatus)return;
    let live=true;
    void backend.webDeviceStatus().then(v=>{if(live)setWebDevice(v);})
      .catch(e=>{if(live)setError(String(e));});
    return()=>{live=false;};
  },[backend,open]);
  async function claimWebDevice(){
    if(!backend.webDeviceClaim||webPairBusy)return;
    setWebPairBusy(true);setWebPairNotice("");setError("");
    try {
      const status=await backend.webDeviceClaim(webEndpoint.trim(),webPairCode.trim());
      setWebDevice(status);setWebPairCode("");
      setWebPairNotice("已领取短期 Windows 授权。尚未建立公网传输连接。");
    }catch(e){setError("网页设备配对失败："+String(e));}
    finally{setWebPairBusy(false);}
  }
  async function connectWebDevice(){
    if(!backend.webDeviceConnect||webPairBusy||!webDevice?.authorized)return;
    setWebPairBusy(true);setWebPairNotice("");setError("");
    try{
      const status=await backend.webDeviceConnect();
      setWebDevice(status);
      setWebPairNotice("Windows 原生 WSS 信令已连接。收发文件仍需双方确认并完成实际设备联调。");
    }catch(e){setError("Windows 信令连接失败："+String(e));}
    finally{setWebPairBusy(false);}
  }
  async function disconnectWebDevice(){
    if(!backend.webDeviceDisconnect||webPairBusy)return;
    setWebPairBusy(true);setError("");
    try {
      await backend.webDeviceDisconnect();
      setWebDevice(null);
      setWebPairNotice("本机设备会话已清除；如需撤销服务端授权，请到网页「我的设备」操作。");
    }catch(e){setError(String(e));}
    finally{setWebPairBusy(false);}
  }
  const [browserReady,setBrowserReady]=useState(false),[browserBusy,setBrowserBusy]=useState(false),[browserCode,setBrowserCode]=useState(""),[browserStatus,setBrowserStatus]=useState("");
  useEffect(()=>{if(!open||!backend.browserAvailable)return;let live=true;void backend.browserAvailable().then(value=>{if(live)setBrowserReady(value);}).catch(()=>{if(live)setBrowserReady(false);});return()=>{live=false;};},[backend,open]);
  async function browserShare(){if(browserBusy||!backend.browserSend)return;const code=crypto.randomUUID();setBrowserCode(code);setBrowserBusy(true);setBrowserStatus("等待浏览器接收；60秒后自动停止");setError("");try{const result=await backend.browserSend(selection.shelf_id,selection.files.map(file=>file.id),code);setBrowserStatus(result.status==="completed"?"对方已确认内容校验":result.status==="cancelled"?"已停止，来源保留":"未确认完成，请核对接收结果");}catch(e){setError(String(e));setBrowserCode("");}finally{setBrowserBusy(false);}}
  const [address,setAddress]=useState(""),[fingerprint,setFingerprint]=useState(""),[bindAddress,setBindAddress]=useState(""),[target,setTarget]=useState(0);
  const [working,setWorking]=useState(false),[sending,setSending]=useState(false),[cancelling,setCancelling]=useState(false),[progress,setProgress]=useState<TransferProgress|null>(null),[result,setResult]=useState<TransferResult|null>(null);
  const pendingId=useRef<string|null>(null),live=useRef(true),show=useRef(onOpenChange);show.current=onOpenChange;
  const bound=shelves.filter(s=>s.kind==="bound"&&s.available);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{if(!open)return;setMode(view.pending?"receive":initialMode);setError("");void backend.view().then(value=>{if(live.current){setView(value);if(value.pending)setMode("receive");}}).catch(e=>{if(live.current)setError(String(e));});},[backend,open,initialMode]);
  useEffect(()=>{let current=true;let cleanup:(()=>void)|undefined;void backend.subscribe({changed:()=>{void backend.view().then(value=>{if(!current)return;setView(value);if(value.pending&&value.pending.id!==pendingId.current){setMode("receive");show.current(true);}pendingId.current=value.pending?.id??null;}).catch(e=>{if(current)setError(String(e));});},progress:value=>{if(current)setProgress(value);}}).then(fn=>{if(current)cleanup=fn;else fn();}).catch(e=>{if(current)setError(String(e));});return()=>{current=false;cleanup?.();};},[backend]);
  async function chooseFolder(){if(!chooseReceiveFolder||working)return;setWorking(true);setError("");try{const id=await chooseReceiveFolder();if(id!==null)setTarget(id);}catch(e){setError(String(e));}finally{setWorking(false);}}
  async function action(run:()=>Promise<void>){if(working)return;setWorking(true);setError("");try{await run();setView(await backend.view());}catch(e){setError(String(e));}finally{if(live.current)setWorking(false);}}
  async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);setCopied(`已复制${label}`);setError("");}catch{setError(`复制${label}失败，请手动选中文本复制。`);}}
  async function send(){if(sending||view.sending)return;setSending(true);setCancelling(false);setProgress(null);setResult(null);setError("");try{if(deviceName&&!known.includes(fingerprint)&&backend.pair){await backend.pair(deviceName,address.trim(),fingerprint.trim());setKnown(value=>[...value,fingerprint]);}const outcome=await backend.send(selection.shelf_id,selection.files.map(file=>file.id),address.trim(),fingerprint.trim());if(live.current)setResult(outcome);}catch(e){if(live.current)setError(String(e));}finally{if(live.current){setSending(false);setCancelling(false);void backend.view().then(setView).catch(e=>setError(String(e)));}}}
  const activeSend=sending||view.sending;
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="transfer-panel" showCloseButton={false}>
    <SheetHeader><SheetTitle>文件互传</SheetTitle><SheetDescription>两台电脑连接同一 Wi-Fi 或局域网；原文件不会被移走</SheetDescription></SheetHeader>
    <Button className="transfer-close" variant="ghost" size="icon" aria-label="关闭文件互传" onClick={()=>onOpenChange(false)}><X size={16}/></Button>
    {error&&<p className="transfer-error" role="alert">{error}</p>}
    <Tabs className="transfer-workspace" value={mode} onValueChange={value=>setMode(value as "send"|"receive")}>
    <TabsList className="transfer-tabs" aria-label="互传方向"><TabsTrigger value="send">发送文件</TabsTrigger><TabsTrigger value="receive">接收文件</TabsTrigger></TabsList>
    <TabsContent ref={content} value={mode} className="transfer-content">
    {mode==="send"?<>
      <strong>1. 选择文件</strong><p className="transfer-note">已选 {selection.files.length} 项{selection.files.length>16?"，一次最多发送16项":""}</p>
      {!selection.files.length&&<p className="capability-hint">先在文件架选择文件，再使用“发送到设备”。<Button variant="outline" onClick={()=>onOpenChange(false)}>返回文件架选文件</Button></p>}
      {!!selection.files.length&&<ul className="transfer-files" aria-label="待发送文件">{selection.files.map(file=><li key={file.id} title={file.name}>{file.name}</li>)}</ul>}
      {webDevice?.signal_online&&backend.webOffer&&backend.webDeviceSignal&&backend.subscribeWebSignals&&
        <DesktopWebOutbox backend={backend} open={open} online={webDevice.signal_online}
          peers={webDevice.online_devices} selection={selection}/>}
      {backend.webSourceInfo&&<details className="transfer-experiment"><summary>网页 / 手机互传 · W3 本机准备检查</summary>
        <section className="connection-fields" aria-label="W3 网页发送文件源预检">
          <strong>文件架 → WebRTC 发送源</strong>
          <p className="muted">选中 1 个普通文件，验证 Windows 文件引用与 SHA-256，并立即释放临时读取授权。本检查不会联网发送或打开网页服务。</p>
          <Button type="button" variant="outline" disabled={webChecking||activeSend||selection.files.length!==1||!selection.shelf_id} onClick={()=>void checkWebSource()}>{webChecking?"正在校验本机文件…":"校验选中文件（本机）"}</Button>
          {webSource&&<div role="status" className="transfer-status"><strong>本机文件已校验 · 尚未发送</strong><p>{webSource.name} · {sizes(webSource.bytes)}</p><p>SHA-256：<code className="transfer-hash">{webSource.sha256}</code></p><p className="muted">此验证仅证明本机文件可读。Windows 设备登录、跨网配对和网页接收仍需 W1–W4 后续服务端验收。</p></div>}
        </section>
      </details>}
      {browserReady&&<details className="transfer-experiment"><summary>浏览器分享测试（仅本机）</summary><section className="connection-fields" aria-label="浏览器本机验证"><strong>浏览器分享 · 本机验证</strong><p className="muted">仅当前电脑可用，尚不支持跨设备。创建后复制接收链接，在本机浏览器打开即可接收；链接含临时分享凭证。</p>{browserCode&&browserBusy&&<><Input aria-label="浏览器接收链接" readOnly value={`http://127.0.0.1:53323/?${new URLSearchParams({code:browserCode})}`}/><Button variant="outline" onClick={()=>void copy(`http://127.0.0.1:53323/?${new URLSearchParams({code:browserCode})}`,"接收链接")}>复制接收链接</Button></>}<p role="status">{browserStatus}</p>{browserBusy?<Button variant="outline" onClick={()=>void backend.browserCancel?.().catch(e=>setError(String(e)))}>停止浏览器分享</Button>:<Button disabled={activeSend||!selection.files.length||selection.files.length>16} onClick={()=>void browserShare()}>创建浏览器分享</Button>}</section></details>}
      <form className="transfer-form" onSubmit={e=>{e.preventDefault();void send();}}>
        <fieldset className="connection-fields"><legend>2. 选择接收设备</legend>
        {backend.devices&&<section aria-label="附近设备"><Button type="button" variant="outline" disabled={finding||activeSend} onClick={()=>void findDevices()}>{finding?"正在查找附近电脑…":"刷新附近设备"}</Button>{!finding&&!devices.length&&<p className="capability-hint">未发现设备？请对方在同一 Wi-Fi 下打开“接收文件”，选择保存位置并开启接收。</p>}{devices.map(device=><Button type="button" variant={address===device.address?"default":"outline"} key={device.fingerprint} disabled={activeSend} onClick={()=>{setAddress(device.address);setFingerprint(device.fingerprint);setDeviceName(device.name);setConnection("");}}>{device.name} · {device.fingerprint.slice(0,6).toUpperCase()}{known.includes(device.fingerprint)?" · 已配对":""}</Button>)}{deviceName&&<p role="status">{known.includes(fingerprint)?`已配对 ${deviceName}，可直接发送。`:`首次连接 ${deviceName}，请与对方核对六位设备码；确认发送后记住此设备。`}</p>}</section>}<p className="capability-hint">也可以请对方点击“复制连接信息”，在下面粘贴一次连接。</p>
        <label>粘贴对方的连接信息<Input aria-label="粘贴对方的连接信息" placeholder="ningmao://receive?…" value={connection} disabled={activeSend} onChange={e=>importConnection(e.target.value)}/></label>
        <details><summary>手动连接 / 查看设备信息</summary><label>接收方地址<Input aria-label="接收方地址" placeholder="192.168.1.20:53317" value={address} disabled={activeSend} onChange={e=>setAddress(e.target.value)} maxLength={80}/></label>
        <label>证书指纹<textarea aria-label="证书指纹" placeholder="接收方显示的64位 SHA256 指纹" value={fingerprint} disabled={activeSend} onChange={e=>setFingerprint(e.target.value)} maxLength={64} rows={2}/></label>
        <p className="muted">指纹用于确认没有连错电脑。请与对方核对；只需复制粘贴，不用手动输入。</p></details>
        </fieldset>
        <p className="capability-hint">3. 点击发送后，等待对方点击“接受文件”。进度会显示在这里。</p>
        {activeSend?<Button type="button" variant="outline" disabled={cancelling} onClick={()=>{setCancelling(true);void backend.cancelSend().catch(e=>{setError(String(e));setCancelling(false);});}}>{cancelling?"正在取消…":"取消发送"}</Button>:<Button type="submit" disabled={!selection.files.length||selection.files.length>16||!address.trim()||!fingerprint.trim()||working}>{deviceName&&!known.includes(fingerprint)?"确认设备并发送":"发送文件"}</Button>}
      </form>
      <div className="transfer-status" role="status">{activeSend?<>{cancelling?"正在取消，等待安全结束":phases[progress?.phase??""]??"正在连接…"}{progress&&<><progress aria-label="发送进度" value={progress.bytes} max={progress.total||1}/><span>{sizes(progress.bytes)} / {sizes(progress.total)} · {progress.file_index+1}/{progress.file_count}项</span></>}</>:result?<><strong>{statuses[result.status]??result.status}</strong><p>{result.message}</p><ul>{result.files.map(file=><li key={file.index}>{selection.files[file.index]?.name??`文件 ${file.index+1}`} · {statuses[file.status]??file.status}</li>)}</ul></>:null}</div>
    </>:<>
      {view.receiving?<section className="transfer-listening">
        <strong>已准备好接收 · 设备码 {view.fingerprint?.slice(0,6).toUpperCase()}</strong>
        <p className="transfer-note">接收到：{shelves.find(s=>s.id===view.shelf_id)?.name??"已选择的绑定目录"}</p>
        <p className="capability-hint">对方粘贴连接即可发送；收到请求后，你仍需确认。</p>
        <div className="transfer-receive-actions"><Button disabled={!view.address||!view.fingerprint} onClick={()=>void copy(`ningmao://receive?${new URLSearchParams({address:view.address??"",fingerprint:view.fingerprint??""})}`,"连接信息")}>复制连接信息</Button><Button variant="outline" disabled={working} onClick={()=>void action(()=>backend.stopReceive())}>停止接收</Button></div>
        {copied&&<p role="status" className="transfer-note">{copied}</p>}
        <details className="transfer-connection-details"><summary>地址与证书信息</summary>
          <div className="transfer-copy-field"><label>本机地址<Input aria-label="本机地址" value={view.address??""} readOnly/></label><Button variant="outline" disabled={!view.address} onClick={()=>void copy(view.address??"","地址")}>复制地址</Button></div>
          <div className="transfer-copy-field"><label>本机证书指纹<textarea aria-label="本机证书指纹" value={view.fingerprint??""} readOnly rows={2}/></label><Button variant="outline" disabled={!view.fingerprint} onClick={()=>void copy(view.fingerprint??"","指纹")}>复制指纹</Button></div>
        </details>
      </section>:<form className="transfer-form" onSubmit={e=>{e.preventDefault();void action(()=>backend.receive(target,bindAddress.trim()));}}>
        <p className="capability-hint">先选文件保存位置，再开启接收。对方发送后，你仍可选择接受或拒绝。</p><label>接收文件架<select aria-label="接收文件架" value={target} onChange={e=>setTarget(Number(e.target.value))}><option value={0}>选择绑定目录</option>{bound.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {chooseReceiveFolder?<Button type="button" variant="outline" disabled={working} onClick={()=>void chooseFolder()}>{working?"正在选择…":bound.length?"选择其他保存文件夹":"选择保存文件夹"}</Button>:!bound.length&&<p className="muted">请在主窗口选择接收文件夹</p>}
        <details><summary>手动指定网络地址（通常无需填写）</summary><label>本机监听地址<Input aria-label="本机监听地址" placeholder="例如 192.168.1.20:53317" value={bindAddress} onChange={e=>setBindAddress(e.target.value)} maxLength={80}/></label>
        <p className="muted">地址填写这台电脑的局域网 IPv4，后面加 :53317。留空时自动选择局域网地址；开启后才可接收文件。</p></details>
        <Button type="submit" disabled={working||!target}>{working?"正在开启…":"开启接收"}</Button>
      </form>}
      {view.pending&&<section className="transfer-request" aria-label="待确认接收"><h3>接收请求 · {view.pending.alias}</h3><ul className="transfer-files">{view.pending.files.map((file,index)=><li key={index}><span title={file.name}>{file.name}</span><small>{sizes(file.size)}</small></li>)}</ul><p>{view.pending.files.length}项 · {sizes(view.pending.total)}</p><div><Button variant="outline" disabled={working} onClick={()=>void action(()=>backend.decide(view.pending!.id,false))}>拒绝接收</Button><Button disabled={working} onClick={()=>void action(()=>backend.decide(view.pending!.id,true))}>接受文件</Button></div></section>}
    </>}
    {backend.webDeviceClaim&&<details className="transfer-experiment" data-testid="w1-device-pair">
      <summary>连接网页 / 手机 · Windows 设备授权（W1）</summary>
      <section className="connection-fields" aria-label="Windows 联网身份授权">
        <strong>受保护网页 → Windows 应用</strong>
        <p className="muted">先到已配置 Cloudflare Access 的柠猫网页「我的设备」生成一次性配对码，再在这里领取本机授权。默认不使用浏览器 Cookie 或 Access JWT。</p>
        {webDevice?.authorized?<div className="transfer-status" role="status">
          <strong>{webDevice.signal_online?"Windows 原生信令已连接 · 网页接收需手动确认":"Windows 已获得临时设备授权 · 未联网传文件"}</strong>
          <p>{webDevice.name} · {webDevice.device_id.slice(0,8)}</p>
          <p>{webDevice.endpoint} · 有效期至 {new Date(webDevice.expires_at).toLocaleString()}</p>
          <p className="muted">凭据只在本次软件内存。W2/W3 接收须下方手动开启并逐次同意，尚未经过真实公网设备验收；默认拒绝所有网页请求。</p>
          <p className="muted">其他在线设备：{webDevice.signal_online?webDevice.online_devices.length:0} 台（不是文件传输成功数）</p>
          {!webDevice.signal_online&&backend.webDeviceConnect&&<Button type="button" disabled={webPairBusy} onClick={()=>void connectWebDevice()}>{webPairBusy?"正在连接信令…":"连接网页信令（W1）"}</Button>}
          <Button type="button" variant="outline" disabled={webPairBusy} onClick={()=>void disconnectWebDevice()}>断开本机授权</Button>
        </div>:<>
          <label>已验证的网页服务地址<Input aria-label="网页服务 HTTPS 地址" placeholder="https://your-worker.workers.dev/" value={webEndpoint} onChange={e=>setWebEndpoint(e.target.value)} disabled={webPairBusy}/></label>
          <label>一次性设备配对码<Input aria-label="Windows 一次性配对码" value={webPairCode} onChange={e=>setWebPairCode(e.target.value)} disabled={webPairBusy} placeholder="nm1i_…" autoComplete="off"/></label>
          <Button type="button" disabled={webPairBusy||!webEndpoint.trim()||!/^nm1i_[a-zA-Z0-9_-]{43}$/.test(webPairCode.trim())} onClick={()=>void claimWebDevice()}>{webPairBusy?"正在验证设备…":"绑定 Windows 设备"}</Button>
          <p className="muted">只能连接自己确认的 HTTPS 服务，原生 Rust 将校验域名和配对码；不会把凭据暴露给网页界面。</p>
        </>}
        {webPairNotice&&<p role="status" className="transfer-note">{webPairNotice}</p>}
      </section>
    </details>}
    {mode==="receive"&&webDevice?.signal_online&&backend.webDeviceSignal&&backend.subscribeWebSignals&&backend.webDeviceSetReceiving&&
      <DesktopWebInbox backend={backend} open={open} online={webDevice.signal_online}
        peers={webDevice.online_devices} shelves={bound}/>}
</TabsContent></Tabs>
  </SheetContent></Sheet>;
}
