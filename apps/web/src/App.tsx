import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check, CheckCircle2, CircleHelp, CloudUpload, FileArchive, FileAudio, FileImage, FileText, FileVideo, FolderOpen, Laptop, LockKeyhole, Menu, Plus, Send, ShieldCheck, Smartphone, X} from "lucide-react";
import {classifyFile, formatBytes} from "./file-utils.mjs";
import {safeFileName, addDistinct, queueReview, visibleQueue, MAX_BROWSER_TRANSFER_BYTES, MAX_BROWSER_TRANSFER_FILES} from "./file-preparation.mjs";
import {LocalFilePreview} from "./LocalFilePreview";
import {useTransferController, type Device} from "./useTransferController";
import {WindowsDevicePairing} from "./WindowsDevicePairing";

type Theme = "light" | "dark" | "blue";
type Screen = "transfer" | "devices" | "activity";
type Queued = {id:string; file:File};
const themes: {value:Theme;label:string}[] = [{value:"light",label:"浅白"},{value:"dark",label:"深蓝"},{value:"blue",label:"亮蓝"}];
const mimeIcon = {image:FileImage, video:FileVideo, audio:FileAudio, archive:FileArchive, document:FileText};

function FileGlyph({name}:{name:string}) {
  const Icon = mimeIcon[classifyFile(name) as keyof typeof mimeIcon];
  return <Icon size={22} aria-hidden="true"/>;
}
function EmptyState({icon:Icon,title,description}:{icon:typeof Laptop;title:string;description:string}) {
  return <div className="empty-state"><Icon size={29} strokeWidth={1.5}/><strong>{title}</strong><span>{description}</span></div>;
}

export function App() {
  const transfer = useTransferController();
  const [targetId,setTargetId] = useState("");
  const [selectedId,setSelectedId] = useState("");
  const requestDialogRef = useRef<HTMLDialogElement>(null);
  const [theme,setTheme] = useState<Theme>(() => {
    try {const saved=localStorage.getItem("ningmao-web-theme");return themes.some(x=>x.value===saved)?saved as Theme:"dark";} catch {return "dark";}
  });
  const [screen,setScreen] = useState<Screen>("transfer");
  const [queued,setQueued] = useState<Queued[]>([]);
  const [dragActive,setDragActive] = useState(false);
  const [showHelp,setShowHelp] = useState(false);
  const [mobileMenu,setMobileMenu] = useState(false);
  const [query,setQuery] = useState("");
  const [kind,setKind] = useState("all");
  const [sort,setSort] = useState("added");
  const [feedback,setFeedback] = useState("");
  const [previewItem,setPreviewItem] = useState<Queued|null>(null);
  const queuedRef = useRef<Queued[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = requestDialogRef.current;
    if (transfer.incoming && dialog && !dialog.open) dialog.showModal();
  },[transfer.incoming]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {localStorage.setItem("ningmao-web-theme",theme);} catch { /* private mode */ }
  },[theme]);

  const addFiles = useCallback((items: FileList | File[]) => {
    const change = addDistinct(queuedRef.current, Array.from(items), () => crypto.randomUUID());
    queuedRef.current = change.items;
    setQueued(change.items);
    const messages: string[] = [];
    if (change.added) messages.push("已加入 " + change.added + " 个文件（仅保存在当前页面）");
    if (change.duplicates) messages.push("跳过 " + change.duplicates + " 个重复文件");
    if (change.invalid) messages.push("拒绝 " + change.invalid + " 个不安全文件名或文件夹");
    const review = queueReview(change.items);
    if (review.oversizedIds.length) messages.push(review.oversizedIds.length + " 个文件超过当前联网候选的 64 MiB 单文件上限");
    if (review.excessCount) messages.push("文件数量超过当前联网候选的 16 项上限");
    setFeedback(messages.join("；") || "没有新增文件");
  },[]);
  const removeFile = (id:string) => {
    const next = queuedRef.current.filter(item => item.id !== id);
    queuedRef.current = next;
    setQueued(next);
    setPreviewItem(item => item?.id === id ? null : item);
    setFeedback("已从列表移除，原文件不受影响");
  };
  const clearFiles = () => {
    queuedRef.current = []; setQueued([]); setPreviewItem(null);
    setFeedback("列表已清空；原文件未被修改");
  };
  const addExample = () => addFiles([new File(
    ["Ningmao 本地合成样例\n仅用于预览选择、筛选和预览流程。\n本文件没有上传至服务器。"],
    "Ningmao-本地测试.txt", {type:"text/plain",lastModified:1}
  )]);
  const reviewed = useMemo(() => queueReview(queued),[queued]);
  const filtered = useMemo(() => visibleQueue(queued,query,kind,sort),[queued,query,kind,sort]);
  const selected = queued.find(item=>item.id===selectedId) ?? queued[0] ?? null;
  const chosenDevice = transfer.devices.find(device=>device.id===targetId) ?? null;
  const canSend = transfer.connection==="online" && !!chosenDevice && !!selected && !transfer.busy && selected.file.size<=MAX_BROWSER_TRANSFER_BYTES && safeFileName(selected.file.name);
  const connectionLabel = transfer.connection==="online" ? "已连接" : transfer.connection==="loading" ? "连接中" : transfer.connection==="unauthorized" ? "未验证" : "未连接";

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.clipboardData?.files?.length) {
        event.preventDefault(); addFiles(event.clipboardData.files);
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.files.length) return;
      event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files);
    };
    window.addEventListener("paste",onPaste);
    window.addEventListener("dragover",onDragOver);
    window.addEventListener("drop",onDrop);
    return () => {
      window.removeEventListener("paste",onPaste);
      window.removeEventListener("dragover",onDragOver);
      window.removeEventListener("drop",onDrop);
    };
  },[addFiles]);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {setMobileMenu(false);setShowHelp(false);}
    };
    window.addEventListener("keydown",onEscape);
    return () => window.removeEventListener("keydown",onEscape);
  },[]);

  return <div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="柠猫 Transfer 首页"><span className="brand-icon"><ArrowLeftRight size={21}/></span><span className="brand-name">柠猫 <b>Transfer</b><small>轻松连接每一台设备</small></span></a>
      <div className="sidebar-section">工作空间</div>
      <nav className="nav">
        <button className={screen==="transfer"?"nav-link selected":"nav-link"} onClick={()=>setScreen("transfer")}><ArrowLeftRight size={18}/>文件互传</button>
        <button className={screen==="devices"?"nav-link selected":"nav-link"} onClick={()=>setScreen("devices")}><Laptop size={18}/>我的设备</button>
        <button className={screen==="activity"?"nav-link selected":"nav-link"} onClick={()=>setScreen("activity")}><FolderOpen size={18}/>传输记录</button>
      </nav>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={18}/><span>隐私优先设计<small>文件经接收方确认后才发送，不提供默认云端保存</small></span></div><div className="sidebar-foot">Ningmao Web · 统一候选 W1–W3</div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="打开导航" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(v=>!v)}><Menu size={20}/></button><span className="breadcrumb">工作空间 <span>/</span> {screen==="transfer"?"文件互传":screen==="devices"?"我的设备":"传输记录"}</span><div className="top-actions"><span className="preview-status"><span className="dot"/>{connectionLabel}</span><div className="theme-switch" aria-label="主题切换">{themes.map(item=><button key={item.value} type="button" className={theme===item.value?"theme-dot active "+item.value:"theme-dot "+item.value} aria-label={item.label} aria-pressed={theme===item.value} title={item.label} onClick={()=>setTheme(item.value)} />)}</div><button className="icon-button" aria-label="关于当前版本" onClick={()=>setShowHelp(true)}><CircleHelp size={19}/></button></div></header>
      {mobileMenu&&<div className="mobile-popover"><button onClick={()=>{setScreen("transfer");setMobileMenu(false)}}>文件互传</button><button onClick={()=>{setScreen("devices");setMobileMenu(false)}}>我的设备</button><button onClick={()=>{setScreen("activity");setMobileMenu(false)}}>传输记录</button></div>}
      <main className="content">
        {screen==="transfer"&&<>
          <div className="page-heading"><div><div className="eyebrow">FILE TRANSFER</div><h1>文件互传</h1><p>准备文件，选择同账号在线设备，确认后加密传送。</p></div><span className="stage-tag">联网联调候选</span></div>
          {transfer.connection!=="online" && <div className="connection-warning" role="status"><LockKeyhole size={17}/><span>{transfer.connection==="loading"?"正在验证身份与设备状态":transfer.connection==="unauthorized"?"尚未通过 Cloudflare Access 服务端验证":"连接服务离线。此环境不会模拟登录或在线设备。"}<small>公开 GitHub Pages 仍是独立的安全 UI 预览，联网功能需要受保护的 Worker 部署。</small></span><button type="button" className="secondary-button" onClick={()=>location.reload()}>重试</button></div>}
          {feedback && <div className="queue-feedback" role="status" aria-live="polite"><span>{feedback}</span><button className="icon-button" type="button" aria-label="关闭提示" onClick={() => setFeedback("")}><X size={16}/></button></div>}
          <div className="transfer-layout"><section className="primary-card">
            <div className="card-heading"><div><h2>准备发送</h2><p>文件不会因为选择而自动上传</p></div><span className="count-chip">{queued.length} 个文件</span></div>
            <input ref={inputRef} type="file" multiple hidden aria-label="选择文件" onChange={event=>{if(event.target.files)addFiles(event.target.files);event.target.value="";}}/>
            <div className={dragActive?"upload-zone dragging":"upload-zone"} onDragEnter={event=>{event.preventDefault();setDragActive(true);}} onDragOver={event=>event.preventDefault()} onDragLeave={event=>{event.preventDefault();if(!event.currentTarget.contains(event.relatedTarget as Node))setDragActive(false);}} onDrop={event=>{event.preventDefault();setDragActive(false);if(event.dataTransfer.files.length)addFiles(event.dataTransfer.files);}}>
              <div className="upload-symbol"><CloudUpload size={30}/></div><strong>将文件拖放到这里</strong><span>也可以从电脑中选择文件</span><button type="button" className="primary-button" onClick={()=>inputRef.current?.click()}><Plus size={16}/>选择文件</button><small>支持常见图片、视频、音频、文档和压缩包</small><button type="button" className="text-button try-example" onClick={addExample}>添加本地测试文件，体验准备流程</button>
            </div>
            {queued.length>0&&<div className="queue">
              <div className="queue-heading"><strong>待发送文件</strong><button type="button" className="text-button" onClick={clearFiles}>清空列表</button></div>
              <div className="queue-tools">
                <input type="search" aria-label="搜索待发送文件" placeholder="搜索文件名" value={query} onChange={event=>setQuery(event.target.value)}/>
                <select aria-label="按文件类型筛选" value={kind} onChange={event=>setKind(event.target.value)}>
                  <option value="all">全部类型</option><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option><option value="document">文档</option><option value="archive">压缩包</option>
                </select>
                <select aria-label="排序待发送文件" value={sort} onChange={event=>setSort(event.target.value)}>
                  <option value="added">添加顺序</option><option value="name">文件名称</option><option value="size">大小降序</option>
                </select>
              </div>
              <div className="queue-result-count">显示 {filtered.length} / {queued.length} 项</div>
              {filtered.length===0?<div className="queue-no-matches">没有符合筛选条件的文件。更换关键词或选择“全部类型”即可恢复列表。</div>:<ul>{filtered.map(item=><li key={item.id}>
                <label className="file-selection" title="选择本次发送的单个文件"><input type="radio" name="selected-send-file" aria-label={"选择发送 " + item.file.name} checked={(selected?.id??"")===item.id} onChange={()=>setSelectedId(item.id)}/></label><span className="file-icon"><FileGlyph name={item.file.name}/></span>
                <span className="file-details"><strong title={item.file.name}>{item.file.name}</strong><small>{formatBytes(item.file.size)}{reviewed.oversizedIds.includes(item.id)?" · 超出候选容量限制":""}</small></span>
                <div className="file-actions"><button type="button" className="secondary-button file-preview" aria-label={"预览 " + item.file.name} onClick={()=>setPreviewItem(item)}>预览</button>
                <button type="button" className="icon-button" aria-label={"移除 " + item.file.name} onClick={()=>removeFile(item.id)}><X size={17}/></button></div>
              </li>)}</ul>}
              <div className="queue-total">共 {reviewed.count} 个 · {formatBytes(reviewed.bytes)}</div>
              {(reviewed.oversizedIds.length>0||reviewed.excessCount>0)&&<p className="queue-warning" role="status">
                当前联网候选限制：单文件不超过 {formatBytes(MAX_BROWSER_TRANSFER_BYTES)}，每次不超过 {MAX_BROWSER_TRANSFER_FILES} 项。
                {reviewed.oversizedIds.length>0&&" 有 "+reviewed.oversizedIds.length+" 项超出单文件容量。"}
                {reviewed.excessCount>0&&" 有 "+reviewed.excessCount+" 项超出数量限制。"}
                本页只做本地检查，不会开始发送。
              </p>}
              <p className="queue-privacy">文件只在当前页面内存中；关闭或刷新将清空，不会扫描本机文件夹。</p>
            </div>}
            <div className="send-footer"><div><LockKeyhole size={17}/><span>{transfer.busy?"正在处理当前传输":"当前版本每次发送一个所选文件；文件不会自动上传"}</span></div>{transfer.busy?<button type="button" className="secondary-button send-button" onClick={transfer.cancel}>取消当前传输</button>:<button type="button" className="primary-button send-button" disabled={!canSend} title={!canSend?"需选择有效文件、目标设备并完成服务端身份验证":"发送给已选设备"} onClick={()=>void transfer.sendFile(selected?.file??null,targetId)}>发送文件 <ArrowUpRight size={17}/></button>}</div>
          </section>
          <div className="secondary-stack">
            <section className="side-card">
              <div className="section-title"><h2>目标设备</h2><span className="offline-label">{connectionLabel}</span></div>
              {transfer.connection==="online"&&transfer.devices.length>0
                ?<div className="connected-devices">{transfer.devices.map(device=><button type="button" className={targetId===device.id?"connected-device selected":"connected-device"} key={device.id} disabled={transfer.busy} aria-pressed={targetId===device.id} onClick={()=>setTargetId(device.id)}><Laptop size={18}/><span><strong>{device.name}</strong><small>在线 · {device.id.slice(0,8)}</small></span>{targetId===device.id&&<Check size={16}/>}</button>)}</div>
                :<EmptyState icon={Laptop} title={transfer.connection==="online"?"暂无其他在线设备":"尚未连接设备"} description={transfer.connection==="online"?"使用同一账号在另一台设备打开本服务，设备便会显示在这里。":"只有服务端完成身份验证后才显示真实设备。"}/>}
              <button type="button" className="secondary-button wide" onClick={()=>setScreen("devices")}>管理设备连接 <ArrowUpRight size={16}/></button>
            </section>
            <section className="side-card receive-card"><div className="receive-icon"><ArrowDownToLine size={20}/></div><h2>从其他设备接收</h2>
              {transfer.downloads.length===0?<p>{transfer.connection==="online"?"接到请求后由你确认，文件通过 SHA-256 校验后可手动保存。":"联网接收服务尚未就绪；不会自动读取或写入电脑文件。"}</p>
              :<div className="saved-file-list">{transfer.downloads.map(d=><div className="saved-file" key={d.id}><span><CheckCircle2 size={15}/><strong title={d.name}>{d.name}</strong><small>{formatBytes(d.size)} · 已校验</small></span><a className="secondary-button" href={d.url} download={d.name}>保存</a></div>)}</div>}
              <button type="button" className="secondary-button wide" onClick={()=>setScreen("activity")}>查看传输任务</button>
            </section>
          </div></div>
        </>}
        {screen==="devices"&&<>
          <div className="page-heading"><div><div className="eyebrow">DEVICES</div><h1>我的设备</h1><p>查看已验证的同账号在线设备；首次连接仍需接收方同意。</p></div></div>
          <section className="primary-card standalone connected-standalone">
            <div className="connected-head"><strong>当前浏览器</strong><span className="offline-label">{connectionLabel}</span></div>
            <label className="device-name-label">本机显示名称<input type="text" defaultValue={transfer.deviceName} maxLength={40} disabled={transfer.busy} title={transfer.busy?"传输进行中不可重新连接设备":"修改名称会重新建立在线会话"} onBlur={e=>transfer.renameDevice(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} aria-label="本机设备名称"/></label>
            <p className="queue-privacy">本机 ID：{transfer.deviceId.slice(0,8)} · 显示名称不构成安全配对或设备信任证明</p>
            <div className="connected-head"><strong>其他在线设备（{transfer.devices.length}）</strong><span className="offline-label">{transfer.identity?.email??"未验证账号"}</span></div>
            {transfer.connection==="online"&&transfer.devices.length>0?<div className="connected-devices">{transfer.devices.map((device:Device)=><button key={device.id} type="button" className={targetId===device.id?"connected-device selected":"connected-device"} aria-pressed={targetId===device.id} onClick={()=>{setTargetId(device.id);setScreen("transfer");}}><Laptop size={18}/><span><strong>{device.name}</strong><small>在线 · {device.id.slice(0,8)}</small></span>{targetId===device.id&&<Check size={16}/>}</button>)}</div>
            :<EmptyState icon={Smartphone} title={transfer.connection==="online"?"暂无其他在线设备":"设备连接尚未启用"} description="设备只由经过服务端验证的在线会话提供，不伪造在线列表。"/>}
            <button type="button" className="secondary-button" onClick={()=>setScreen("transfer")}>返回文件互传</button>
          </section>
          <WindowsDevicePairing authenticated={transfer.identity!==null}/>
        </>}
        {screen==="activity"&&<>
          <div className="page-heading"><div><div className="eyebrow">ACTIVITY</div><h1>传输记录</h1><p>真实会话状态仅在当前浏览器页面保留；并不等于已保存到磁盘。</p></div></div>
          <section className="primary-card standalone connected-standalone">
            {transfer.tasks.length===0?<EmptyState icon={FileText} title="还没有传输任务" description="等待真实文件邀请或发送任务后，这里会显示状态；不会凭空生成历史记录。"/>
              :<ul className="network-tasks">{transfer.tasks.map(t=><li key={t.id}><div><strong title={t.name}>{t.name}</strong><small>{t.direction} · {t.status}</small></div><progress aria-label={"传输进度 " + t.name} value={Math.min(1,Math.max(0,t.fraction))} max={1}/></li>)}</ul>}
            {transfer.downloads.length>0&&<div className="activity-downloads"><strong>待保存文件</strong>{transfer.downloads.map(d=><div className="saved-file" key={d.id}><span><CheckCircle2 size={16}/><strong title={d.name}>{d.name}</strong><small>{formatBytes(d.size)}</small></span><a className="secondary-button" download={d.name} href={d.url}>保存</a></div>)}</div>}
            <button type="button" className="secondary-button" onClick={()=>setScreen("transfer")}>返回文件互传</button>
          </section>
        </>}
      </main>
    </div>
    {previewItem&&<LocalFilePreview file={previewItem.file} onClose={()=>setPreviewItem(null)}/>}
    {transfer.incoming&&<dialog ref={requestDialogRef} className="incoming-dialog" aria-labelledby="incoming-title" onCancel={event=>{event.preventDefault();transfer.decide(false);}}><div className="receive-icon"><ArrowDownToLine size={22}/></div><h2 id="incoming-title">收到文件请求</h2><p>来自 {transfer.devices.find(d=>d.id===transfer.incoming?.from)?.name||"另一台已验证设备"}，是否接收？</p><div className="incoming-file"><FileText size={19}/><strong title={transfer.incoming.meta.name}>{transfer.incoming.meta.name}</strong><small>{formatBytes(transfer.incoming.meta.size)}</small></div><p className="queue-privacy">接受后会校验 SHA-256；校验通过仍需你主动点击保存。</p><div className="incoming-actions"><button type="button" className="secondary-button" onClick={()=>transfer.decide(false)}>拒绝</button><button type="button" className="primary-button" onClick={()=>transfer.decide(true)}>接受文件</button></div></dialog>}    {transfer.notice&&<div className="queue-feedback floating-error" role="alert"><span>{transfer.notice}</span><button type="button" className="icon-button" aria-label="关闭网络错误" onClick={()=>transfer.setNotice("")}><X size={16}/></button></div>}
    {showHelp&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setShowHelp(false);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" aria-label="关闭" onClick={()=>setShowHelp(false)}><X size={18}/></button><div className="receive-icon"><ShieldCheck size={23}/></div><h2 id="help-title">关于柠猫 Transfer 联网候选</h2><p>当前网页已实现响应式界面、三套主题、文件选择/拖入/粘贴、本地预览、去重、筛选、排序、移除与容量提示。文件仅保存在当前浏览器页面的内存中。</p><p>只有 Cloudflare Access 完成服务端身份验证且设备在线时才开放单文件发送。Windows 客户端双向传输与保存闭环尚未实机验收。关闭或刷新网页会清空未发送文件。</p><button className="primary-button wide" onClick={()=>setShowHelp(false)}>我知道了 <Check size={16}/></button></section></div>}
  </div>;
}
