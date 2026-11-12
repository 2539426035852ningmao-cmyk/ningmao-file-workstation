import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check, CircleHelp, CloudUpload, FileArchive, FileAudio, FileImage, FileText, FileVideo, FolderOpen, Laptop, LockKeyhole, Menu, Moon, Plus, Send, ShieldCheck, Smartphone, Trash2, Upload, X} from "lucide-react";
import {classifyFile, formatBytes} from "./file-utils.mjs";
import {addDistinct, queueReview, visibleQueue, MAX_BROWSER_TRANSFER_BYTES, MAX_BROWSER_TRANSFER_FILES} from "./file-preparation.mjs";
import {LocalFilePreview} from "./LocalFilePreview";

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
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={18}/><span>隐私优先设计<small>未连接服务时，文件只保留在本机浏览器内存中</small></span></div><div className="sidebar-foot">Ningmao Web · W0 预览</div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="打开导航" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(v=>!v)}><Menu size={20}/></button><span className="breadcrumb">工作空间 <span>/</span> {screen==="transfer"?"文件互传":screen==="devices"?"我的设备":"传输记录"}</span><div className="top-actions"><span className="preview-status"><span className="dot"/>界面预览</span><div className="theme-switch" aria-label="主题切换">{themes.map(item=><button key={item.value} type="button" className={theme===item.value?"theme-dot active "+item.value:"theme-dot "+item.value} aria-label={item.label} aria-pressed={theme===item.value} title={item.label} onClick={()=>setTheme(item.value)} />)}</div><button className="icon-button" aria-label="关于当前预览" onClick={()=>setShowHelp(true)}><CircleHelp size={19}/></button></div></header>
      {mobileMenu&&<div className="mobile-popover"><button onClick={()=>{setScreen("transfer");setMobileMenu(false)}}>文件互传</button><button onClick={()=>{setScreen("devices");setMobileMenu(false)}}>我的设备</button><button onClick={()=>{setScreen("activity");setMobileMenu(false)}}>传输记录</button></div>}
      <main className="content">
        {screen==="transfer"&&<>
          <div className="page-heading"><div><div className="eyebrow">FILE TRANSFER</div><h1>文件互传</h1><p>选择文件，轻松发送到另一台设备。</p></div><span className="stage-tag">基础界面 · W0</span></div>
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
                <span className="file-icon"><FileGlyph name={item.file.name}/></span>
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
            <div className="send-footer"><div><LockKeyhole size={17}/><span>已完成本地准备；真实发送需要安全连接服务</span></div><button className="primary-button send-button" disabled title="需要完成身份验证、设备连接和传输后端">发送文件 <ArrowUpRight size={17}/></button></div>
          </section>
          <div className="secondary-stack"><section className="side-card"><div className="section-title"><h2>目标设备</h2><span className="offline-label">未连接</span></div><EmptyState icon={Laptop} title="暂无已连接的设备" description="W1 阶段将接入账号登录、设备绑定与在线状态。"/><button className="secondary-button wide" onClick={()=>setScreen("devices")}>查看设备连接状态 <ArrowUpRight size={16}/></button></section><section className="side-card receive-card"><div className="receive-icon"><ArrowDownToLine size={20}/></div><h2>从其他设备接收</h2><p>使用同一账号，或者通过受控连接码向其他浏览器与 Windows 客户端接收文件。</p><button className="secondary-button wide" disabled title="尚未部署身份与传输服务">接收文件 · 即将开放</button></section></div></div>
        </>}
        {screen==="devices"&&<><div className="page-heading"><div><div className="eyebrow">DEVICES</div><h1>我的设备</h1><p>连接并管理受信任的设备。</p></div></div><section className="primary-card standalone"><EmptyState icon={Smartphone} title="设备连接尚未启用" description="后续将提供登录身份、首次配对、连接状态、撤销授权；当前不会展示虚构的在线设备。"/><button className="secondary-button" onClick={()=>setScreen("transfer")}>返回文件互传</button></section></>}
        {screen==="activity"&&<><div className="page-heading"><div><div className="eyebrow">ACTIVITY</div><h1>传输记录</h1><p>查看真实任务的状态、进度与结果。</p></div></div><section className="primary-card standalone"><EmptyState icon={FileText} title="还没有传输任务" description="接入传输服务后，真实发送和接收记录将显示在这里。选择文件不等于已发送。"/><button className="secondary-button" onClick={()=>setScreen("transfer")}>返回文件互传</button></section></>}
      </main>
    </div>
    {previewItem&&<LocalFilePreview file={previewItem.file} onClose={()=>setPreviewItem(null)}/>}
    {showHelp&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setShowHelp(false);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" aria-label="关闭" onClick={()=>setShowHelp(false)}><X size={18}/></button><div className="receive-icon"><ShieldCheck size={23}/></div><h2 id="help-title">关于 W0 前端预览</h2><p>当前网页已实现响应式界面、三套主题、文件选择/拖入/粘贴、本地预览、去重、筛选、排序、移除与容量提示。文件仅保存在当前浏览器页面的内存中。</p><p>账号登录、在线设备、网页互传与 Windows 客户端互传还未接通，因此发送和接收按钮保持禁用。关闭或刷新网页会清空未发送文件。</p><button className="primary-button wide" onClick={()=>setShowHelp(false)}>我知道了 <Check size={16}/></button></section></div>}
  </div>;
}
