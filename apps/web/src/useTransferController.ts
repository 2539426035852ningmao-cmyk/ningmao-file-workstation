import {useCallback,useEffect,useRef,useState} from "react";
import {hex,MAX_BYTES,readable,validInvite,safeFileName,type Invite} from "./guards";
import {PeerLink,type WireSignal} from "./peer";
import {sameSession} from "./signaling";

export type Device = {id:string;name:string};
export type Task = {id:string;name:string;direction:"发送"|"接收";status:string;fraction:number};
export type Incoming = {from:string;meta:Invite};
export type Download = {id:string;name:string;size:number;url:string};
type Message = {type:string;from?:string;to?:string;id?:string;devices?:Device[];payload?:Record<string,unknown>};
const DEVICE_KEY="ningmao-web-session-id", NAME_KEY="ningmao-web-device-name";
function stored(key:string,fallback:string) {try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
function persist(key:string,value:string) {try{localStorage.setItem(key,value);}catch{/* privacy mode */}}
function initialDevice(){
  // Device presence is an online *tab session*, not a trusted persistent identity.
  // localStorage is shared by tabs and would cause the newer tab to kick off the first.
  let existing="";
  try {existing=sessionStorage.getItem(DEVICE_KEY)||"";} catch { /* private window */ }
  if(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(existing))return existing;
  const id=crypto.randomUUID();
  try {sessionStorage.setItem(DEVICE_KEY,id);} catch { /* transient session */ }
  return id;
}
const deviceId=initialDevice();
/** Authenticated Web Worker + WebRTC controller, separated from the W0 design system.
 * This hook NEVER reads local filesystem paths or stores remote file bytes in a server.
 */
export function useTransferController() {
  const [deviceName, setDeviceName] = useState(() => stored(NAME_KEY, /Android|iPhone|iPad/i.test(navigator.userAgent) ? "移动浏览器" : "我的浏览器"));
  const [identity, setIdentity] = useState<{ email: string } | null>(null);
  const [connection, setConnection] = useState<"loading" | "unauthorized" | "offline" | "online">("loading");
  const [devices, setDevices] = useState<Device[]>([]);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const link = useRef<PeerLink | null>(null);
  const active = useRef<{ id: string; to: string } | null>(null);
  const outbound = useRef<{ bytes: ArrayBuffer; meta: Invite; to: string } | null>(null);
  const inbound = useRef<Incoming | null>(null);
  const downloadUrls = useRef<string[]>([]);
  const handler = useRef<(msg: Message) => void>(() => {});
  const outgoingDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearOutgoing = () => { if (outgoingDeadline.current) clearTimeout(outgoingDeadline.current); outgoingDeadline.current = null; };
  const clearIncoming = () => { if (incomingDeadline.current) clearTimeout(incomingDeadline.current); incomingDeadline.current = null; };

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(old => old.map(task => task.id === id ? { ...task, ...patch } : task));
  }, []);
  const sendSignal = useCallback((message: WireSignal | { type: string; to: string; payload: Record<string, unknown> }) => {
    if (socket.current?.readyState !== WebSocket.OPEN) throw new Error("设备连接已断开");
    socket.current.send(JSON.stringify(message));
  }, []);
  const fail = useCallback((text: string) => {
    if (outgoingDeadline.current) clearTimeout(outgoingDeadline.current);
    if (incomingDeadline.current) clearTimeout(incomingDeadline.current);
    outgoingDeadline.current = null;
    incomingDeadline.current = null;
    setNotice(text);
    if (active.current) {
      updateTask(active.current.id, { status: "失败：" + text });
      try { sendSignal({ type: "cancel", to: active.current.to, payload: { id: active.current.id } }); } catch { /* disconnected */ }
    }
    link.current?.close(); link.current = null;
    active.current = null; outbound.current = null; inbound.current = null;
    setIncoming(null); setBusy(false);
  }, [sendSignal, updateTask]);
  const makeLink = useCallback((remote: string, id: string, direction: "发送" | "接收") => new PeerLink({
    remote,
    signal: sendSignal,
    progress: (done, total) => updateTask(id, { fraction: total ? done / total : 1, status: direction === "发送" ? "正在发送" : "正在接收" }),
    ready: (blob, meta) => {
      const url = URL.createObjectURL(blob);
      downloadUrls.current.push(url);
      setDownloads(old => [{ id: meta.id, name: meta.name, size: meta.size, url }, ...old].slice(0, 8));
      updateTask(id, { fraction: 1, status: "已校验，可保存到设备" });
      try { sendSignal({ type: "receipt", to: remote, payload: { id, ok: true } }); } catch { /* receiver still has the verified file */ }
      clearOutgoing(); clearIncoming();
      setBusy(false); active.current = null; inbound.current = null;
    },
    transmitted: () => {
      updateTask(id, { fraction: 1, status: "已发送，等待对方校验" });
      clearOutgoing();
      outgoingDeadline.current = setTimeout(() => fail("接收方未在规定时间内确认校验"), 60_000);
    },
    error: fail
  }), [sendSignal, updateTask, fail]);

  handler.current = (msg: Message) => {
    if (msg.type === "presence" && Array.isArray(msg.devices)) {
      setDevices(msg.devices.filter(p => p.id !== deviceId));
      return;
    }
    if (msg.type === "unavailable") {
      const current = active.current;
      if (current && current.id === msg.id && current.to === msg.to) fail("接收设备已离线");
      return;
    }
    const from = msg.from || "";
    const payload = msg.payload || {};
    if (msg.type === "invite") {
      if (!validInvite(payload) || active.current || inbound.current) {
        if (from) try { sendSignal({ type: "decision", to: from, payload: { id: String(payload.id || ""), accepted: false } }); } catch { /* disconnected */ }
        return;
      }
      const request = { from, meta: payload };
      inbound.current = request;
      setIncoming(request);
      clearIncoming();
      incomingDeadline.current = setTimeout(() => {
        if (inbound.current?.meta.id === request.meta.id) {
          inbound.current = null;
          setIncoming(null);
          try { sendSignal({ type: "decision", to: request.from, payload: { id: request.meta.id, accepted: false } }); } catch { /* disconnected */ }
        }
      }, 60_000);
      return;
    }
    if (msg.type === "decision" && outbound.current && active.current?.to === from &&
        payload.id === outbound.current.meta.id) {
      clearOutgoing();
      if (payload.accepted !== true) {
        updateTask(outbound.current.meta.id, { status: "对方已拒绝" });
        outbound.current = null; active.current = null; setBusy(false);
        return;
      }
      const { bytes, meta } = outbound.current;
      outgoingDeadline.current = setTimeout(() => fail("建立传输连接超时"), 120_000);
      const rtc = makeLink(from, meta.id, "发送");
      link.current = rtc;
      void rtc.startSender(bytes, meta).catch(e => fail(String(e)));
      outbound.current = null;
      return;
    }
    if ((msg.type === "description" || msg.type === "candidate") && sameSession(active.current, from, payload) && link.current) {
      void link.current.handle(msg.type, payload).catch(e => fail(String(e)));
      return;
    }
    if (msg.type === "receipt" && sameSession(active.current, from, payload) && payload.ok === true) {
      clearOutgoing();
      updateTask(active.current!.id, { status: payload.persisted === true ? "Windows 工作站已确认保存" : "对方已校验（需自行保存）", fraction: 1 });
      active.current = null; link.current?.close(); link.current = null; setBusy(false);
      return;
    }
    if (msg.type === "cancel" && sameSession(active.current, from, payload)) {
      clearOutgoing(); clearIncoming();
      updateTask(active.current!.id, { status: "对方已取消" });
      link.current?.close(); link.current = null;
      active.current = null; outbound.current = null; inbound.current = null;
      setIncoming(null); setBusy(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    const connect = async () => {
      setConnection("loading");
      try {
        const response = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) { if (!disposed) setConnection(response.status === 401 ? "unauthorized" : "offline"); return; }
        const me = await response.json() as { email: string };
        if (disposed) return;
        setIdentity(me);
      } catch { if (!disposed) setConnection("offline"); return; }
      const wsUrl = new URL("/api/connect", location.href);
      wsUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl.searchParams.set("device", deviceId);
      wsUrl.searchParams.set("name", deviceName);
      ws = new WebSocket(wsUrl);
      socket.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        setConnection("online");
        ping = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 30_000);
      };
      ws.onmessage = e => {
        try { handler.current(JSON.parse(e.data as string) as Message); } catch { /* reject malformed server message */ }
      };
      ws.onclose = () => {
        if (ping) clearInterval(ping);
        if (disposed) return;
        setConnection("offline"); setDevices([]);
        link.current?.close(); link.current = null;
        if (active.current) updateTask(active.current.id, { status: "网络中断，未确认完成" });
        clearOutgoing(); clearIncoming();
        outbound.current = null; active.current = null; inbound.current = null;
        setBusy(false); setIncoming(null);
        retry = setTimeout(connect, 3500);
      };
      ws.onerror = () => { if (!disposed) setConnection("offline"); };
    };
    void connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      ws?.close();
      if (socket.current === ws) socket.current = null;
      link.current?.close();
      clearOutgoing(); clearIncoming();
    };
  }, [deviceName]);

  useEffect(() => () => {
    for (const url of downloadUrls.current) URL.revokeObjectURL(url);
  }, []);
  useEffect(() => {
    const activeUrls = new Set(downloads.map(d => d.url));
    for (const url of downloadUrls.current) if (!activeUrls.has(url)) URL.revokeObjectURL(url);
    downloadUrls.current = [...activeUrls];
  }, [downloads]);
  async function sendFile(file: File | null, destination: string) {
    if (busy || connection !== "online" || !destination || !file) return;
    setBusy(true); setNotice("");
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) throw new Error("文件超过首版容量限制");
      const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
      if (!safeFileName(file.name)) throw new Error("文件名不符合跨设备安全规则");
      const meta: Invite = { id: crypto.randomUUID(), name: file.name, size: bytes.byteLength, mime: file.type.slice(0, 100), sha256 };
      active.current = { id: meta.id, to: destination };
      outbound.current = { bytes, meta, to: destination };
      setTasks(old => [{ id: meta.id, name: meta.name, direction: "发送" as const, status: "等待接收确认", fraction: 0 }, ...old].slice(0, 20));
      sendSignal({ type: "invite", to: destination, payload: meta });
      clearOutgoing();
      outgoingDeadline.current = setTimeout(() => fail("接收方未在 60 秒内确认"), 60_000);
    } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
  }
  function decide(accepted: boolean) {
    const request = inbound.current;
    if (!request) return;
    clearIncoming();
    setIncoming(null);
    if (!accepted) {
      inbound.current = null;
      try { sendSignal({ type: "decision", to: request.from, payload: { id: request.meta.id, accepted: false } }); } catch { /* disconnected */ }
      return;
    }
    active.current = { id: request.meta.id, to: request.from };
    setBusy(true);
    setTasks(old => [{ id: request.meta.id, name: request.meta.name, direction: "接收" as const, status: "正在建立连接", fraction: 0 }, ...old].slice(0, 20));
    const rtc = makeLink(request.from, request.meta.id, "接收");
    link.current = rtc;
    rtc.prepareReceiver(request.meta);
    clearOutgoing();
    outgoingDeadline.current = setTimeout(() => fail("接收数据超时或网络无法直连"), 120_000);
    try { sendSignal({ type: "decision", to: request.from, payload: { id: request.meta.id, accepted: true } }); }
    catch (e) { fail(String(e)); }
  }
  function cancel() {
    if (!active.current) return;
    const { id, to } = active.current;
    clearOutgoing(); clearIncoming();
    updateTask(id, { status: "已取消" });
    try { sendSignal({ type: "cancel", to, payload: { id } }); } catch { /* disconnected */ }
    link.current?.close(); link.current = null;
    active.current = null; outbound.current = null; inbound.current = null;
    setBusy(false); setIncoming(null);
  }

  const renameDevice=(name:string)=>{
    const normalized=name.trim().slice(0,40)||"我的浏览器";
    if(normalized!==deviceName){setDeviceName(normalized);persist(NAME_KEY,normalized);}
  };
  return {deviceId,deviceName,renameDevice,identity,connection,devices,incoming,downloads,tasks,notice,setNotice,busy,sendFile,decide,cancel};
}
