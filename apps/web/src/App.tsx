import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CheckCircle2, CircleHelp, CloudOff, File, FolderOpen, HardDriveDownload, Laptop, LockKeyhole, Monitor, Moon, Send, ShieldCheck, Smartphone, Sun, UploadCloud, X } from "lucide-react";
import { hex, MAX_BYTES, readable, shortName, validInvite, type Invite } from "./guards";
import { PeerLink, type WireSignal } from "./peer";
import { sameSession } from "./signaling";

type Theme = "light" | "dark" | "blue";
type Device = { id: string; name: string };
type Task = { id: string; name: string; direction: "发送" | "接收"; status: string; fraction: number };
type Message = { type: string; from?: string; to?: string; id?: string; devices?: Device[]; payload?: Record<string, unknown> };
type Incoming = { from: string; meta: Invite };
type Download = { id: string; name: string; size: number; url: string };
const DEVICE_KEY = "ningmao-web-device-id";
const NAME_KEY = "ningmao-web-device-name";
const THEME_KEY = "ningmao-web-theme";

function stored(key: string, fallback: string) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function persist(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private mode */ } }
function initialDevice() {
  const existing = stored(DEVICE_KEY, "");
  if (/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(existing)) return existing;
  const id = crypto.randomUUID();
  persist(DEVICE_KEY, id);
  return id;
}
function deviceIcon(name: string) { return /phone|手机|iphone|android/i.test(name) ? Smartphone : Laptop; }
const deviceId = initialDevice();

export function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = stored(THEME_KEY, "dark");
    return t === "light" || t === "blue" ? t : "dark";
  });
  const [deviceName, setDeviceName] = useState(() => stored(NAME_KEY, /Android|iPhone|iPad/i.test(navigator.userAgent) ? "移动浏览器" : "我的浏览器"));
  const [identity, setIdentity] = useState<{ email: string } | null>(null);
  const [connection, setConnection] = useState<"loading" | "unauthorized" | "offline" | "online">("loading");
  const [devices, setDevices] = useState<Device[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [destination, setDestination] = useState("");
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const requestDialog = useRef<HTMLDialogElement>(null);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const link = useRef<PeerLink | null>(null);
  const active = useRef<{ id: string; to: string } | null>(null);
  const outbound = useRef<{ bytes: ArrayBuffer; meta: Invite; to: string } | null>(null);
  const inbound = useRef<Incoming | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
      if (current?.id === msg.id && current.to === msg.to) fail("接收设备已离线");
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
      updateTask(active.current!.id, { status: "对方已校验（需自行保存）", fraction: 1 });
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
  useEffect(() => {
    if (!incoming) return;
    const dialog = requestDialog.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [incoming]);
  const choose = (incomingFile?: File) => {
    if (!incomingFile) return;
    if (incomingFile.size > MAX_BYTES) {
      setNotice(`首版单文件最大 ${readable(MAX_BYTES)}，请换一个较小的文件`);
      return;
    }
    setFile(incomingFile); setNotice("");
  };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    choose(e.target.files?.[0]);
    e.target.value = "";
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    choose(e.dataTransfer.files[0]);
  };
  async function sendFile() {
    if (busy || connection !== "online" || !destination || !file) return;
    setBusy(true); setNotice("");
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) throw new Error("文件超过首版容量限制");
      const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
      const meta: Invite = { id: crypto.randomUUID(), name: file.name.slice(0, 200), size: bytes.byteLength, mime: file.type.slice(0, 100), sha256 };
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
  const current = devices.find(d => d.id === destination);
  return <div className="web-app" data-theme={theme}>
    <div className="shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="柠猫 Transfer 首页"><span className="brand-icon"><ArrowLeftRight size={20}/></span><span><strong>柠猫 <span className="brand-light">Transfer</span></strong><small>文件，自由流动</small></span></a>
        <div className="header-right"><span className={`connection-indicator ${connection}`}><span className="dot"/>{connection === "online" ? "已连接" : connection === "loading" ? "连接中" : "未连接"}</span><span className="account">{identity?.email || "未登录"}</span><a className="avatar" href="/cdn-cgi/access/logout" title="退出 Cloudflare Access">N</a></div>
      </header>
      <main className="workspace">
        <section className="intro"><div><div className="eyebrow"><span className="tiny-dot"/> 柠猫 Web · 工作空间</div><h1>文件，<span>传到你要用的地方。</span></h1><p>选择设备、拖入文件、确认接收。无需先上传云盘。</p></div></section>
        {connection !== "online" && <div className="warning" role="status"><LockKeyhole size={17}/><div><strong>{connection === "unauthorized" ? "尚未通过身份验证" : connection === "loading" ? "正在验证访问身份" : "连接服务暂不可用"}</strong><span>{connection === "unauthorized" ? "部署时需配置 Cloudflare Access 应用与 Worker 环境变量。此页面不会模拟登录成功。" : "请检查网络和服务部署状态，当前不能发送或接收文件。"}</span></div><button onClick={() => location.reload()}>重新尝试</button></div>}
        <div className="content-grid">
          <section className="panel devices-panel"><div className="section-title"><div><div className="section-kicker">DEVICES</div><h2>我的设备 <span>{devices.length}</span></h2></div><Monitor size={20}/></div>
            <div className="device-list">
              <div className="device own"><div className="device-icon"><Monitor size={20}/></div><div className="device-text"><strong>{deviceName}</strong><small>此浏览器 · {deviceId.slice(0, 8)}</small></div><span className="device-pill">本机</span></div>
              {devices.map(device => { const Icon = deviceIcon(device.name); return <button key={device.id} className={`device select-device ${destination === device.id ? "selected" : ""}`} onClick={() => setDestination(device.id)} disabled={busy} aria-pressed={destination === device.id}><div className="device-icon"><Icon size={20}/></div><div className="device-text"><strong title={device.name}>{shortName(device.name)}</strong><small>在线 · {device.id.slice(0, 8)}</small></div><span className="device-online"/></button>; })}
              {devices.length === 0 && <div className="empty-device"><CloudOff size={24}/><strong>暂无其他在线设备</strong><span>在另一台设备使用同一账号打开本网站，就会显示在这里。</span></div>}
            </div>
            <div className="device-footer"><label htmlFor="deviceName">本机显示名称</label><div className="rename"><input id="deviceName" defaultValue={deviceName} maxLength={40} onBlur={e => { const name = e.target.value.trim() || "我的浏览器"; e.target.value = name; if (name !== deviceName) { setDeviceName(name); persist(NAME_KEY, name); } }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="本机设备名称"/><span>自动同步在线状态</span></div></div>
          </section>
          <section className="panel transfer-panel-web"><div className="section-title"><div><div className="section-kicker">TRANSFER</div><h2>发送文件</h2></div><span className="limit">单个文件 · 最多 64 MB</span></div>
            <div className={`drop-zone ${file ? "has-file" : ""}`} onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={() => !busy && fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); fileInput.current?.click(); } }} aria-label="选择需要传输的文件">
              <input ref={fileInput} type="file" hidden onChange={onInput}/>
              {file ? <><div className="upload-icon"><File size={25}/></div><strong title={file.name}>{shortName(file.name)}</strong><p>{readable(file.size)} · 点击更换文件</p></> : <><div className="upload-icon"><UploadCloud size={25}/></div><strong>拖入文件，或点击选择</strong><p>图片、视频、文档、压缩包都可以</p></>}
            </div>
            <div className="send-bottom"><div className="target-info"><span>发送到</span><strong>{current ? current.name : "请先在左侧选择设备"}</strong></div><button className="primary-btn" onClick={() => void sendFile()} disabled={busy || connection !== "online" || !file || !current}><Send size={17}/>发送文件</button></div>
            {busy && <button className="cancel-btn" onClick={cancel}><X size={14}/>取消当前传输</button>}
            <div className="safety-note"><ShieldCheck size={15}/>仅向同账号设备发送；接收前需要对方确认</div>
          </section>
          <section className="panel inbox-panel"><div className="section-title"><div><div className="section-kicker">RECEIVE</div><h2>接收文件 <span>{downloads.length}</span></h2></div><ArrowDownToLine size={20}/></div>
            {downloads.length === 0 ? <div className="inbox-empty"><div className="inbox-symbol"><HardDriveDownload size={25}/></div><strong>接收区已准备好</strong><p>收到传输请求后，你可以选择接受或拒绝。验证通过的文件会显示在这里，等待你保存。</p></div> : <div className="download-list">{downloads.map(d => <div className="download-item" key={d.id}><div className="download-file"><CheckCircle2 size={18}/><div><strong title={d.name}>{shortName(d.name)}</strong><small>{readable(d.size)} · 已完成 SHA-256 校验</small></div></div><a href={d.url} download={d.name} className="download-btn"><ArrowDownToLine size={15}/>保存</a></div>)}</div>}
          </section>
          <section className="panel history-panel"><div className="section-title"><div><div className="section-kicker">ACTIVITY</div><h2>传输记录</h2></div><FolderOpen size={20}/></div>
            {tasks.length === 0 ? <div className="history-empty"><CircleHelp size={20}/><span>开始传输后，这里会显示任务进度和结果</span></div> : <div className="task-list">{tasks.map(task => <div className="task" key={task.id}><div className="task-heading"><span>{task.direction === "发送" ? <ArrowUpFromLine size={15}/> : <ArrowDownToLine size={15}/>}<strong title={task.name}>{shortName(task.name)}</strong></span><small>{task.direction}</small></div><div className="task-sub"><span>{task.status}</span><span>{Math.round(task.fraction * 100)}%</span></div><div className="task-track"><div style={{ width: `${task.fraction * 100}%` }}/></div></div>)}</div>}
          </section>
        </div>
        {notice && <div className="toast" role="alert"><span>{notice}</span><button aria-label="关闭提醒" onClick={() => setNotice("")}><X size={16}/></button></div>}
        {incoming && <dialog ref={requestDialog} className="dialog" aria-labelledby="requestTitle" onCancel={event => { event.preventDefault(); decide(false); }}><div className="request-icon"><ArrowDownToLine size={25}/></div><h2 id="requestTitle">收到文件请求</h2><p>设备 {devices.find(d => d.id === incoming.from)?.name || incoming.from.slice(0, 8)} 希望发送文件给你</p><div className="request-file"><File size={18}/><div><strong title={incoming.meta.name}>{shortName(incoming.meta.name)}</strong><small>{readable(incoming.meta.size)}</small></div></div><div className="dialog-actions"><button className="outline-btn" onClick={() => decide(false)}>拒绝</button><button className="primary-btn" onClick={() => decide(true)}>接受文件</button></div></dialog>}
      </main>
      <footer className="footer"><div><ShieldCheck size={14}/>设备间加密连接 · 不提供默认云端存储 · 当前为测试候选</div><div className="theme-switch" aria-label="主题切换"><button aria-label="浅白主题" aria-pressed={theme === "light"} onClick={() => { setTheme("light"); persist(THEME_KEY, "light"); }}><Sun size={15}/></button><button aria-label="深蓝主题" aria-pressed={theme === "dark"} onClick={() => { setTheme("dark"); persist(THEME_KEY, "dark"); }}><Moon size={15}/></button><button aria-label="亮蓝主题" aria-pressed={theme === "blue"} onClick={() => { setTheme("blue"); persist(THEME_KEY, "blue"); }}><span className="theme-dot"/></button></div></footer>
    </div>
  </div>;
}
