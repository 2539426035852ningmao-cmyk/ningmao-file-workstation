import {useEffect,useState} from "react";
import {Check,ClipboardCopy,Laptop,RefreshCw,ShieldCheck,Trash2} from "lucide-react";
import {DEVICE_SESSION_TTL_MS,PAIR_CODE_TTL_MS} from "./deviceEnrollment";

type Device = {id:string;name:string;expires_at:number};
async function post<T>(url:string,body:Record<string,unknown>):Promise<T>{
  const res=await fetch(url,{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok)throw new Error(res.status===401?"登录已失效，请重新验证账号":"服务端暂不可用（HTTP "+res.status+"）");
  return res.json() as Promise<T>;
}
export function WindowsDevicePairing({authenticated}:{authenticated:boolean}){
  const [code,setCode]=useState("");
  const [expires,setExpires]=useState(0);
  const [devices,setDevices]=useState<Device[]>([]);
  const [loading,setLoading]=useState<"issue"|"refresh"|"revoke"|null>(null);
  const [confirm,setConfirm]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!code||!expires)return;
    const remaining=Math.max(0,expires-Date.now());
    const timer=setTimeout(()=>{setCode("");setExpires(0);},remaining);
    return()=>clearTimeout(timer);
  },[code,expires]);
  useEffect(()=>{if(authenticated)void refresh();else{setCode("");setDevices([]);}},[authenticated]);
  async function refresh(){
    if(!authenticated)return;
    setLoading("refresh");setNotice("");
    try{
      const res=await fetch("/api/devices",{credentials:"same-origin",cache:"no-store"});
      if(!res.ok)throw new Error("当前无法读取受信任设备列表（HTTP "+res.status+"）");
      const data=await res.json() as {devices?:Device[]};
      setDevices(Array.isArray(data.devices)?data.devices:[]);
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}
    finally{setLoading(null);}
  }
  async function issue(){
    if(!authenticated||loading)return;
    setLoading("issue");setNotice("");setCode("");
    try{
      const data=await post<{code:string;expires_at:number}>("/api/device-invites",{});
      if(typeof data.code!=="string"||!Number.isFinite(data.expires_at))throw new Error("服务端配对响应不完整");
      setCode(data.code);setExpires(data.expires_at);
      setNotice("一次性配对码已生成，只能在两分钟内使用一次。");
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}
    finally{setLoading(null);}
  }
  async function copy(){
    if(!code)return;
    try{await navigator.clipboard.writeText(code);setNotice("配对码已复制；请只粘贴到自己电脑的柠猫工作站。");}
    catch{setNotice("复制失败，请手动选中代码复制。");}
  }
  async function revoke(id:string){
    if(!authenticated||loading||confirm!==id)return;
    setLoading("revoke");setNotice("");
    try{
      const result=await post<{removed:boolean}>("/api/devices/revoke",{id});
      setConfirm("");
      setNotice(result.removed?"设备授权已撤销，现有 Windows 信令连接将被关闭。":"设备可能已失效，请刷新列表。");
      setDevices(v=>v.filter(d=>d.id!==id));
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}
    finally{setLoading(null);}
  }
  return <section className="primary-card standalone connected-standalone web-enrollment" aria-label="Windows 工作站网页授权">
    <div className="connected-head"><strong><ShieldCheck size={18} aria-hidden="true"/> Windows 工作站授权</strong><span className="offline-label">W1 开发候选</span></div>
    <p className="queue-privacy">只允许经当前账号明确授权的 Windows 设备进入同账号信令房间。不复制网页登录 Cookie 或 Access JWT；配对码与设备凭据不会保存在浏览器本地存储中。</p>
    <div className="web-enrollment-actions">
      <button type="button" className="secondary-button" disabled={!authenticated||loading!==null} onClick={()=>void issue()}>生成 Windows 配对码</button>
      <button type="button" className="secondary-button" disabled={!authenticated||loading!==null} onClick={()=>void refresh()}><RefreshCw size={15} aria-hidden="true"/>刷新已授权设备</button>
    </div>
    {!authenticated&&<p className="queue-privacy">需要先通过 Cloudflare Access 登录，不能在本地静态预览生成真实配对凭据。</p>}
    {code&&<div className="web-enrollment-code" role="status">
      <strong>一次性配对码</strong>
      <code aria-label="Windows 一次性配对码">{code}</code>
      <small>两分钟有效 · 仅使用一次 · 生成后请立即在 Windows 应用内粘贴。不要公开分享，也不要填入普通网站。</small>
      <button type="button" className="secondary-button" onClick={()=>void copy()}><ClipboardCopy size={15} aria-hidden="true"/>复制配对码</button>
    </div>}
    <div className="connected-head"><strong>已授权 Windows 设备（{devices.length}）</strong><span className="offline-label">最长有效 24 小时</span></div>
    {devices.length===0?<p className="queue-privacy">当前没有有效的 Windows 设备授权。授权记录与在线状态不同，网页上出现设备不代表 Windows 已传输文件。</p>
      :<ul className="web-enrollment-list">{devices.map(device=><li key={device.id}>
        <div><Laptop size={17} aria-hidden="true"/><span><strong>{device.name}</strong><small>设备 ID {device.id.slice(0,8)} · 凭据有效期至 {new Date(device.expires_at).toLocaleString()}</small></span></div>
        {confirm===device.id?<div className="web-enrollment-actions">
          <button type="button" className="secondary-button" onClick={()=>setConfirm("")}>取消</button>
          <button type="button" className="secondary-button" disabled={loading!==null} onClick={()=>void revoke(device.id)}><Check size={15} aria-hidden="true"/>确认撤销</button>
        </div>:<button type="button" className="secondary-button" disabled={loading!==null} onClick={()=>setConfirm(device.id)}><Trash2 size={15} aria-hidden="true"/>撤销授权</button>}
      </li>)}</ul>}
    {notice&&<p role="status" className="queue-feedback">{notice}</p>}
    <p className="queue-privacy">注意：当前 Windows 应用侧的输入、凭据加密保存和实际 WebRTC 传输仍在开发中。生成配对码并不表示跨设备互传已经完成。</p>
    <small className="web-enrollment-meta" aria-hidden="true">配对有效期 {Math.round(PAIR_CODE_TTL_MS/60_000)} 分钟 · 设备会话最长 {Math.round(DEVICE_SESSION_TTL_MS/3_600_000)} 小时</small>
  </section>;
}
