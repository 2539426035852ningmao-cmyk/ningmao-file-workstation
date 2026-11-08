import {useEffect, useRef, useState} from "react";
import {ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check, CircleHelp, CloudUpload, FileArchive, FileAudio, FileImage, FileText, FileVideo, FolderOpen, Laptop, LockKeyhole, Menu, Moon, Plus, Send, ShieldCheck, Smartphone, Trash2, Upload, X} from "lucide-react";
import {classifyFile, formatBytes, totalSize} from "./file-utils.mjs";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {localStorage.setItem("ningmao-web-theme",theme);} catch { /* private mode */ }
  },[theme]);

  const addFiles = (items: FileList | File[]) => {
    const files = Array.from(items);
    setQueued(previous => {
      const seen = new Set(previous.map(({file})=>[file.name,file.size,file.lastModified].join(":")));
      const next = [...previous];
      for (const file of files) {
        const key = [file.name,file.size,file.lastModified].join(":");
        if (!seen.has(key)) {next.push({id:crypto.randomUUID(),file});seen.add(key);}
      }
      return next;
    });
  };
  const removeFile = (id:string) => setQueued(old=>old.filter(item=>item.id!==id));

  return <div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <a className="brand" href="/" aria-label="柠猫 Transfer 首页"><span className="brand-icon"><ArrowLeftRight size={21}/></span><span className="brand-name">柠猫 <b>Transfer</b><small>轻松连接每一台设备</small></span></a>
      <div className="sidebar-section">工作空间</div>
      <nav className="nav">
        <button className={screen==="transfer"?"nav-link selected":"nav-link"} onClick={()=>setScreen("transfer")}><ArrowLeftRight size={18}/>文件互传</button>
        <button className={screen==="devices"?"nav-link selected":"nav-link"} onClick={()=>setScreen("devices")}><Laptop size={18}/>我的设备</button>
        <button className={screen==="activity"?"nav-link selected":"nav-link"} onClick={()=>setScreen("activity")}><FolderOpen size={18}/>传输记录</button>
      </nav>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={18}/><span>隐私优先设计<small>未连接服务时，文件只保留在本机浏览器内存中</small></span></div><div className="sidebar-foot">Ningmao Web · W0 预览</div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="打开导航" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(v=>!v)}><Menu size={20}/></button><span className="breadcrumb">工作空间 <span>/</span> {screen==="transfer"?"文件互传":screen==="devices"?"我的设备":"传输记录"}</span><div className="top-actions"><span className="preview-status"><span className="dot"/>本地预览</span><div className="theme-switch" aria-label="主题切换">{themes.map(item=><button key={item.value} type="button" className={theme===item.value?"theme-dot active "+item.value:"theme-dot "+item.value} aria-label={item.label} aria-pressed={theme===item.value} title={item.label} onClick={()=>setTheme(item.value)} />)}</div><button className="icon-button" aria-label="关于当前预览" onClick={()=>setShowHelp(true)}><CircleHelp size={19}/></button></div></header>
      {mobileMenu&&<div className="mobile-popover"><button onClick={()=>{setScreen("transfer");setMobileMenu(false)}}>文件互传</button><button onClick={()=>{setScreen("devices");setMobileMenu(false)}}>我的设备</button><button onClick={()=>{setScreen("activity");setMobileMenu(false)}}>传输记录</button></div>}
      <main className="content">
        {screen==="transfer"&&<>
          <div className="page-heading"><div><div className="eyebrow">FILE TRANSFER</div><h1>文件互传</h1><p>选择文件，轻松发送到另一台设备。</p></div><span className="stage-tag">基础界面 · W0</span></div>
          <div className="transfer-layout"><section className="primary-card">
            <div className="card-heading"><div><h2>准备发送</h2><p>文件不会因为选择而自动上传</p></div><span className="count-chip">{queued.length} 个文件</span></div>
            <input ref={inputRef} type="file" multiple hidden aria-label="选择文件" onChange={event=>{if(event.target.files)addFiles(event.target.files);event.target.value="";}}/>
            <div className={dragActive?"upload-zone dragging":"upload-zone"} onDragEnter={event=>{event.preventDefault();setDragActive(true);}} onDragOver={event=>event.preventDefault()} onDragLeave={event=>{event.preventDefault();if(!event.currentTarget.contains(event.relatedTarget as Node))setDragActive(false);}} onDrop={event=>{event.preventDefault();setDragActive(false);if(event.dataTransfer.files.length)addFiles(event.dataTransfer.files);}}>
              <div className="upload-symbol"><CloudUpload size={30}/></div><strong>将文件拖放到这里</strong><span>也可以从电脑中选择文件</span><button type="button" className="primary-button" onClick={()=>inputRef.current?.click()}><Plus size={16}/>选择文件</button><small>支持常见图片、视频、音频、文档和压缩包</small>
            </div>
            {queued.length>0&&<div className="queue"><div className="queue-heading"><strong>待发送文件</strong><button className="text-button" onClick={()=>setQueued([])}>清空列表</button></div><ul>{queued.map(item=><li key={item.id}><span className="file-icon"><FileGlyph name={item.file.name}/></span><span className="file-details"><strong title={item.file.name}>{item.file.name}</strong><small>{formatBytes(item.file.size)}</small></span><button className="icon-button" aria-label={`移除 ${item.file.name}`} onClick={()=>removeFile(item.id)}><X size={17}/></button></li>)}</ul><div className="queue-total">共 {queued.length} 个 · {formatBytes(totalSize(queued.map(q=>q.file)))}</div></div>}
            <div className="send-footer"><div><LockKeyhole size={17}/><span>发送需等待安全连接服务启用</span></div><button className="primary-button send-button" disabled title="需要完成身份验证、设备连接和传输后端">发送文件 <ArrowUpRight size={17}/></button></div>
          </section>
          <div className="secondary-stack"><section className="side-card"><div className="section-title"><h2>目标设备</h2><span className="offline-label">未连接</span></div><EmptyState icon={Laptop} title="暂无已连接的设备" description="W1 阶段将接入账号登录、设备绑定与在线状态。"/><button className="secondary-button wide" onClick={()=>setScreen("devices")}>查看设备连接状态 <ArrowUpRight size={16}/></button></section><section className="side-card receive-card"><div className="receive-icon"><ArrowDownToLine size={20}/></div><h2>从其他设备接收</h2><p>使用同一账号，或者通过受控连接码向其他浏览器与 Windows 客户端接收文件。</p><button className="secondary-button wide" disabled title="尚未部署身份与传输服务">接收文件 · 即将开放</button></section></div></div>
        </>}
        {screen==="devices"&&<><div className="page-heading"><div><div className="eyebrow">DEVICES</div><h1>我的设备</h1><p>连接并管理受信任的设备。</p></div></div><section className="primary-card standalone"><EmptyState icon={Smartphone} title="设备连接尚未启用" description="后续将提供登录身份、首次配对、连接状态、撤销授权；当前不会展示虚构的在线设备。"/><button className="secondary-button" onClick={()=>setScreen("transfer")}>返回文件互传</button></section></>}
        {screen==="activity"&&<><div className="page-heading"><div><div className="eyebrow">ACTIVITY</div><h1>传输记录</h1><p>查看真实任务的状态、进度与结果。</p></div></div><section className="primary-card standalone"><EmptyState icon={FileText} title="还没有传输任务" description="接入传输服务后，真实发送和接收记录将显示在这里。选择文件不等于已发送。"/><button className="secondary-button" onClick={()=>setScreen("transfer")}>返回文件互传</button></section></>}
      </main>
    </div>
    {showHelp&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setShowHelp(false);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" aria-label="关闭" onClick={()=>setShowHelp(false)}><X size={18}/></button><div className="receive-icon"><ShieldCheck size={23}/></div><h2 id="help-title">关于 W0 前端预览</h2><p>当前网页已实现响应式界面、三套完整主题、文件选择、拖入、去重、列表与移除。文件仅保存在当前浏览器页面的内存中。</p><p>账号登录、在线设备、网页互传与 Windows 客户端互传还未接通，因此发送和接收按钮保持禁用。关闭或刷新网页会清空未发送文件。</p><button className="primary-button wide" onClick={()=>setShowHelp(false)}>我知道了 <Check size={16}/></button></section></div>}
  </div>;
}
