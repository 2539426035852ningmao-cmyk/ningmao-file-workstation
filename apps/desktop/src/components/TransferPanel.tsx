import {useEffect,useRef,useState} from "react";
import {X} from "lucide-react";
import {Button} from "./ui/button";
import {Input} from "./ui/input";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "./ui/sheet";
import type {Shelf} from "../backend";
import type {TransferBackend,TransferProgress,TransferResult,TransferView} from "../transferBackend";

const empty:TransferView={receiving:false,address:null,fingerprint:null,shelf_id:null,pending:null,sending:false};
const sizes=(n:number)=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:n>=1024?`${(n/1024).toFixed(1)} KB`:`${n} B`;
const phases:Record<string,string>={preparing:"准备中",waiting:"等待接收确认",sending:"发送中",terminal:"正在核对结果"};
const statuses:Record<string,string>={completed:"已完成",cancelled:"已取消",partial:"部分完成",failed:"发送失败",interrupted:"传输中断，需核对接收结果",rejected:"已拒绝",not_sent:"未发送"};
export type TransferSelection={shelf_id:number;files:{id:number;name:string}[]};

export function TransferPanel({backend,open,onOpenChange,initialMode,selection,shelves}:{backend:TransferBackend;open:boolean;onOpenChange:(value:boolean)=>void;initialMode:"send"|"receive";selection:TransferSelection;shelves:Shelf[]}){
  const [mode,setMode]=useState(initialMode),[view,setView]=useState(empty),[error,setError]=useState("");
  const [copied,setCopied]=useState("");
  const [address,setAddress]=useState(""),[fingerprint,setFingerprint]=useState(""),[bindAddress,setBindAddress]=useState(""),[target,setTarget]=useState(0);
  const [working,setWorking]=useState(false),[sending,setSending]=useState(false),[cancelling,setCancelling]=useState(false),[progress,setProgress]=useState<TransferProgress|null>(null),[result,setResult]=useState<TransferResult|null>(null);
  const pendingId=useRef<string|null>(null),live=useRef(true),show=useRef(onOpenChange);show.current=onOpenChange;
  const bound=shelves.filter(s=>s.kind==="bound"&&s.available);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{if(!open)return;setMode(view.pending?"receive":initialMode);setError("");void backend.view().then(value=>{if(live.current){setView(value);if(value.pending)setMode("receive");}}).catch(e=>{if(live.current)setError(String(e));});},[backend,open,initialMode]);
  useEffect(()=>{let current=true;let cleanup:(()=>void)|undefined;void backend.subscribe({changed:()=>{void backend.view().then(value=>{if(!current)return;setView(value);if(value.pending&&value.pending.id!==pendingId.current){setMode("receive");show.current(true);}pendingId.current=value.pending?.id??null;}).catch(e=>{if(current)setError(String(e));});},progress:value=>{if(current)setProgress(value);}}).then(fn=>{if(current)cleanup=fn;else fn();}).catch(e=>{if(current)setError(String(e));});return()=>{current=false;cleanup?.();};},[backend]);
  async function action(run:()=>Promise<void>){if(working)return;setWorking(true);setError("");try{await run();setView(await backend.view());}catch(e){setError(String(e));}finally{if(live.current)setWorking(false);}}
  async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);setCopied(`已复制${label}`);setError("");}catch{setError(`复制${label}失败，请手动选中文本复制。`);}}
  async function send(){if(sending||view.sending)return;setSending(true);setCancelling(false);setProgress(null);setResult(null);setError("");try{const outcome=await backend.send(selection.shelf_id,selection.files.map(file=>file.id),address.trim(),fingerprint.trim());if(live.current)setResult(outcome);}catch(e){if(live.current)setError(String(e));}finally{if(live.current){setSending(false);setCancelling(false);void backend.view().then(setView).catch(e=>setError(String(e)));}}}
  const activeSend=sending||view.sending;
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="transfer-panel" showCloseButton={false}>
    <SheetHeader><SheetTitle>文件互传</SheetTitle><SheetDescription>来源保留，同名文件自动编号</SheetDescription></SheetHeader>
    <Button className="transfer-close" variant="ghost" size="icon" aria-label="关闭文件互传" onClick={()=>onOpenChange(false)}><X size={16}/></Button>
    <div className="transfer-tabs" role="tablist" aria-label="互传方向"><Button variant={mode==="send"?"secondary":"ghost"} role="tab" aria-selected={mode==="send"} onClick={()=>setMode("send")}>发送文件</Button><Button variant={mode==="receive"?"secondary":"ghost"} role="tab" aria-selected={mode==="receive"} onClick={()=>setMode("receive")}>接收文件</Button></div>
    <div className="transfer-content">{mode==="send"?<>
      <p className="transfer-note">已选 {selection.files.length} 项{selection.files.length>16?"，一次最多发送16项":""}</p>
      {!!selection.files.length&&<ul className="transfer-files" aria-label="待发送文件">{selection.files.map(file=><li key={file.id} title={file.name}>{file.name}</li>)}</ul>}
      <form className="transfer-form" onSubmit={e=>{e.preventDefault();void send();}}>
        <label>接收方地址<Input aria-label="接收方地址" placeholder="192.168.1.20:53317" value={address} disabled={activeSend} onChange={e=>setAddress(e.target.value)} maxLength={80}/></label>
        <label>证书指纹<Input aria-label="证书指纹" placeholder="接收方显示的64位SHA256指纹" value={fingerprint} disabled={activeSend} onChange={e=>setFingerprint(e.target.value)} maxLength={64}/></label>
        <p className="muted">请向接收方核对地址和指纹</p>
        {activeSend?<Button type="button" variant="outline" disabled={cancelling} onClick={()=>{setCancelling(true);void backend.cancelSend().catch(e=>{setError(String(e));setCancelling(false);});}}>{cancelling?"正在取消…":"取消发送"}</Button>:<Button type="submit" disabled={!selection.files.length||selection.files.length>16||!address.trim()||!fingerprint.trim()||working}>发送文件</Button>}
      </form>
      <div className="transfer-status" role="status">{activeSend?<>{cancelling?"正在取消，等待安全结束":phases[progress?.phase??""]??"正在连接…"}{progress&&<><progress aria-label="发送进度" value={progress.bytes} max={progress.total||1}/><span>{sizes(progress.bytes)} / {sizes(progress.total)} · {progress.file_index+1}/{progress.file_count}项</span></>}</>:result?<><strong>{statuses[result.status]??result.status}</strong><p>{result.message}</p><ul>{result.files.map(file=><li key={file.index}>{selection.files[file.index]?.name??`文件 ${file.index+1}`} · {statuses[file.status]??file.status}</li>)}</ul></>:null}</div>
    </>:<>
      {view.receiving?<section className="transfer-listening"><strong>接收已开启</strong><div className="transfer-copy-field"><label>本机地址<Input aria-label="本机地址" value={view.address??""} readOnly/></label><Button variant="outline" disabled={!view.address} onClick={()=>void copy(view.address??"","地址")}>复制地址</Button></div><div className="transfer-copy-field"><label>本机证书指纹<textarea aria-label="本机证书指纹" value={view.fingerprint??""} readOnly rows={2}/></label><Button variant="outline" disabled={!view.fingerprint} onClick={()=>void copy(view.fingerprint??"","指纹")}>复制指纹</Button></div><p className="muted">接收到：{shelves.find(s=>s.id===view.shelf_id)?.name??"已选择的绑定目录"}</p>{copied&&<p role="status" className="muted">{copied}</p>}<Button variant="outline" disabled={working} onClick={()=>void action(()=>backend.stopReceive())}>停止接收</Button></section>:<form className="transfer-form" onSubmit={e=>{e.preventDefault();void action(()=>backend.receive(target,bindAddress.trim()));}}>
        <label>接收文件架<select aria-label="接收文件架" value={target} onChange={e=>setTarget(Number(e.target.value))}><option value={0}>选择绑定目录</option>{bound.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {!bound.length&&<p className="muted">请先绑定一个接收文件夹</p>}
        <label>本机监听地址<Input aria-label="本机监听地址" placeholder="本机局域网IPv4:53317" value={bindAddress} onChange={e=>setBindAddress(e.target.value)} maxLength={80}/></label>
        <p className="muted">仅在主动开启后监听，每批文件仍需确认</p>
        <Button type="submit" disabled={working||!target||!bindAddress.trim()}>{working?"正在开启…":"开启接收"}</Button>
      </form>}
      {view.pending&&<section className="transfer-request" aria-label="待确认接收"><h3>接收请求 · {view.pending.alias}</h3><ul className="transfer-files">{view.pending.files.map((file,index)=><li key={index}><span title={file.name}>{file.name}</span><small>{sizes(file.size)}</small></li>)}</ul><p>{view.pending.files.length}项 · {sizes(view.pending.total)}</p><div><Button variant="outline" disabled={working} onClick={()=>void action(()=>backend.decide(view.pending!.id,false))}>拒绝接收</Button><Button disabled={working} onClick={()=>void action(()=>backend.decide(view.pending!.id,true))}>接受文件</Button></div></section>}
    </>}{error&&<p className="transfer-error" role="alert">{error}</p>}</div>
  </SheetContent></Sheet>;
}
