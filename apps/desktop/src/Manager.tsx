import {useEffect,useMemo,useRef,useState} from "react";
import {Archive,Check,File,Folder,Layers,Search,Settings,Tags,ListTodo,RefreshCw,X} from "lucide-react";
import {Button} from "./components/ui/button";
import {Input} from "./components/ui/input";
import type {Backend,DesktopPreferences,DesktopView,ManagementSnapshot} from "./backend";
import {observeTheme,readTheme,writeTheme} from "./preferences";

const empty:ManagementSnapshot={shelves:[],items:[],jobs:[]};
const sections=[["overview","总览",Layers],["assets","素材",File],["tags","标签",Tags],["jobs","任务",ListTodo],["settings","设置",Settings]] as const;
const jobNames:Record<string,string>={queued:"等待中",copying:"复制中",completed:"已完成",failed:"失败",partial:"部分完成",cancelled:"已取消",interrupted:"上次中断"};
const defaultPreferences:DesktopPreferences={edge:"free",auto_hide:false,topmost:true};
const perPage=100;

export default function Manager({backend}:{backend:Backend}) {
  const [data,setData]=useState(empty),[desktop,setDesktop]=useState<DesktopView|null>(null);
  const [section,setSection]=useState("overview"),[query,setQuery]=useState(""),[shelf,setShelf]=useState(0),[tagFilter,setTagFilter]=useState("");
  const [selected,setSelected]=useState<number[]>([]),[page,setPage]=useState(0),[tag,setTag]=useState(""),[detail,setDetail]=useState<number|null>(null);
  const [error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [preferences,setPreferences]=useState(defaultPreferences),[dirty,setDirty]=useState(false),[theme,setTheme]=useState(readTheme);
  const live=useRef(true),refreshVersion=useRef(0),settingsDirty=useRef(false);
  async function refresh() {
    const version=++refreshVersion.current;
    const [snapshot,view]=await Promise.all([backend.managementSnapshot(),backend.desktopState()]);
    if(live.current && version===refreshVersion.current){setData(snapshot);setDesktop(view);if(!settingsDirty.current)setPreferences(view.layout.preferences);setLoading(false);}
  }
  useEffect(()=>{live.current=true;let dispose:(()=>void)|undefined;
    void refresh().catch(e=>{if(live.current){setError(String(e));setLoading(false);}});
    void backend.subscribe({drop:()=>{},hover:()=>{},drag:()=>{},progress:()=>{},
      finished:()=>{void refresh().catch(e=>setError(String(e)));},changed:()=>{void refresh().catch(e=>setError(String(e)));},
      metadata:()=>{void refresh().catch(e=>setError(String(e)));},
      desktop:view=>{if(live.current){setDesktop(view);if(!settingsDirty.current)setPreferences(view.layout.preferences);}},error:setError,
    }).then(fn=>{if(live.current)dispose=fn;else fn();}).catch(e=>setError(String(e)));
    return()=>{live.current=false;dispose?.();};
  },[backend]);
  useEffect(()=>{document.documentElement.classList.toggle("dark",theme==="dark");},[theme]);
  useEffect(()=>observeTheme(setTheme),[]);
  useEffect(()=>{setPage(0);},[query,shelf,tagFilter]);
  const visible=useMemo(()=>data.items.filter(i=>(!shelf || i.shelf_id===shelf) && (!tagFilter || i.tags.includes(tagFilter)) && i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())),[data.items,shelf,tagFilter,query]);
  const pages=Math.max(1,Math.ceil(visible.length/perPage)),currentPage=Math.min(page,pages-1),rows=visible.slice(currentPage*perPage,(currentPage+1)*perPage);
  const chosen=visible.filter(i=>selected.includes(i.id)),current=data.items.find(i=>i.id===detail);
  const tags=[...new Set(data.items.flatMap(i=>i.tags))].sort((a,b)=>a.localeCompare(b,"zh-CN"));
  const shelfName=(id:number)=>data.shelves.find(s=>s.id===id)?.name || "文件架";
  async function act(action:()=>Promise<void>) {if(busy)return;setBusy(true);setError("");try{await action();}catch(e){setError(String(e));}finally{if(live.current)setBusy(false);}}
  function patchPreferences(patch:Partial<DesktopPreferences>) {settingsDirty.current=true;setDirty(true);setPreferences(value=>({...value,...patch}));}
  const jobs=<div className="manager-jobs">{!data.jobs.length?<p className="manager-empty">暂无复制任务</p>:data.jobs.map(job=><article key={job.id}><div><strong>{jobNames[job.status] || job.status}</strong><span>{shelfName(job.shelf_id)}</span></div><p>{job.message}</p>{["queued","copying"].includes(job.status) && <Button variant="outline" size="sm" disabled={busy} onClick={()=>void act(async()=>{await backend.cancel(job.id);setMessage("已请求取消，等待复制任务安全结束。");})}>取消复制</Button>}</article>)}</div>;
  return <div className="manager-shell">
    <aside className="manager-nav"><h1>管理中心</h1><nav aria-label="管理中心导航">{sections.map(([key,label,Icon])=><Button key={key} variant="ghost" className={section===key?"active":""} aria-current={section===key?"page":undefined} onClick={()=>setSection(key)}><Icon size={17}/><span>{label}</span></Button>)}</nav><p>柠猫文件工作站</p></aside>
    <main className="manager-main"><header><h2>{sections.find(([key])=>key===section)?.[1]}</h2><Button variant="ghost" size="sm" disabled={loading || busy} onClick={()=>void act(async()=>{await refresh();setMessage("已刷新收集记录。");})}><RefreshCw size={15}/>刷新记录</Button></header>
    {error && <div className="error-bar" role="alert"><span>{error}</span><Button variant="ghost" size="icon" aria-label="关闭管理错误" onClick={()=>setError("")}><X size={15}/></Button></div>}
    {desktop?.warning && <p className="manager-warning" role="alert">{desktop.warning}</p>}
    {loading?<p className="manager-empty">正在读取已收集记录…</p>:<>
      {section==="overview" && <section className="manager-overview"><div className="manager-section-heading"><h3>文件架</h3><p>选择文件架，在日常小窗中继续整理</p></div><div className="manager-shelves">{data.shelves.map(s=><button key={s.id} onClick={()=>void act(()=>backend.desktopOpen(s.id))} disabled={busy}>{s.kind==="bound"?<Folder size={20}/>:<Archive size={20}/>}<span><strong>{s.name}</strong><small>{s.kind==="bound"?"绑定目录":s.kind==="session"?"本次中转":"持久引用"} · {data.items.filter(i=>i.shelf_id===s.id).length} 项已收集记录</small></span></button>)}</div><div className="manager-section-heading"><h3>最近任务</h3><p>只显示已经发生的复制任务</p></div>{jobs}</section>}
      {section==="assets" && <section className="manager-assets">
        <div className="manager-filters"><label className="manager-search"><Search size={16}/><Input aria-label="搜索已收集素材" placeholder="搜索已收集素材" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="素材文件架" value={shelf} onChange={e=>setShelf(Number(e.target.value))}><option value={0}>全部文件架</option>{data.shelves.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select aria-label="素材标签" value={tagFilter} onChange={e=>setTagFilter(e.target.value)}><option value="">全部标签</option>{tags.map(t=><option key={t}>{t}</option>)}</select></div>
        <p className="manager-note">仅检索已收集名称和标签，不扫描磁盘；文件可用状态请在文件架中刷新。</p>
        <form className="manager-tag-actions" onSubmit={e=>{e.preventDefault();if(!chosen.length || chosen.length>256 || !tag.trim())return;void act(async()=>{const count=await backend.tagReferences(chosen.map(i=>i.id),tag.trim(),false);await refresh();setMessage(`已更新 ${count} 项；原文件和其他标签保持不变。`);});}}><span>已选 {chosen.length} 项</span><Input aria-label="标签名称" placeholder="标签名称" value={tag} maxLength={64} onChange={e=>setTag(e.target.value)}/><Button type="submit" size="sm" disabled={busy || !chosen.length || chosen.length>256 || !tag.trim()}>添加标签</Button><Button type="button" variant="outline" size="sm" disabled={busy || !chosen.length || chosen.length>256 || !tag.trim()} onClick={()=>void act(async()=>{const count=await backend.tagReferences(chosen.map(i=>i.id),tag.trim(),true);await refresh();setMessage(`已更新 ${count} 项；仅移除指定标签。`);})}>移除标签</Button></form>
        {chosen.length>256 && <p role="alert">一次最多修改256项，不会只处理部分选中项。</p>}
        <div className="manager-table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="选择本页文件" checked={!!rows.length && rows.every(i=>selected.includes(i.id))} onChange={e=>setSelected(value=>e.target.checked?[...new Set([...value,...rows.map(i=>i.id)])]:value.filter(id=>!rows.some(i=>i.id===id)))}/></th><th>名称</th><th>文件架</th><th>标签</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{rows.map(item=><tr key={item.id} data-selected={selected.includes(item.id)}><td><input type="checkbox" aria-label={`选择 ${item.name}`} checked={selected.includes(item.id)} onChange={e=>setSelected(value=>e.target.checked?[...value,item.id]:value.filter(id=>id!==item.id))}/></td><td><button className="manager-file-name" title={item.name} onClick={()=>setDetail(item.id)}>{item.name}</button></td><td title={shelfName(item.shelf_id)}>{shelfName(item.shelf_id)}</td><td title={item.tags.join("、")}>{item.tags.join("、") || "—"}</td><td><Button variant="ghost" size="sm" aria-label={`打开 ${item.name} 所在文件架`} disabled={busy} onClick={()=>void act(()=>backend.desktopOpen(item.shelf_id))}>打开文件架</Button></td></tr>)}</tbody></table>{!rows.length && <p className="manager-empty">没有匹配的已收集素材</p>}</div>
        <div className="manager-pagination"><span>{visible.length} 项 · 第 {currentPage+1}/{pages} 页</span><Button variant="ghost" size="sm" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>上一页</Button><Button variant="ghost" size="sm" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>下一页</Button></div>
        {current && <aside className="manager-detail" aria-label="素材记录详情"><div><h3>{current.name}</h3><Button variant="ghost" size="icon" aria-label="关闭素材详情" onClick={()=>setDetail(null)}><X size={15}/></Button></div><dl><dt>来源路径</dt><dd>{current.path}</dd><dt>文件架</dt><dd>{shelfName(current.shelf_id)}</dd><dt>标签</dt><dd>{current.tags.join("、") || "无"}</dd></dl></aside>}
      </section>}
      {section==="tags" && <section><p className="manager-note">标签只保存在软件内，不改名或移动原文件。</p><div className="manager-tag-list">{tags.length?tags.map(t=><button key={t} onClick={()=>{setTagFilter(t);setQuery("");setShelf(0);setSection("assets");}}><Tags size={16}/><span>{t}</span><small>{data.items.filter(i=>i.tags.includes(t)).length} 项</small></button>):<p className="manager-empty">暂无标签，选择素材后可批量添加。</p>}</div></section>}
      {section==="jobs" && <section><p className="manager-note">最近20项复制任务；取消后保留来源和已完成副本。</p>{jobs}</section>}
      {section==="settings" && <section className="manager-settings"><h3>桌面入口</h3><p>贴边后保留细柄；鼠标靠近或拖入时展开，拖入期间保持接收。</p><form onSubmit={e=>{e.preventDefault();void act(async()=>{const saved=await backend.desktopConfigure(preferences);settingsDirty.current=false;setDirty(false);await refresh();setMessage(saved?"桌面设置已保存。":"设置已临时应用；布局文件未改写，请查看提示。");});}}>
        <label>入口位置模式<select value={preferences.edge} onChange={e=>patchPreferences({edge:e.target.value as DesktopPreferences["edge"],auto_hide:e.target.value==="free"?false:preferences.auto_hide})}><option value="free">自由悬浮</option><option value="left">屏幕左侧</option><option value="right">屏幕右侧</option></select></label>
        <label className="manager-checkbox"><input type="checkbox" checked={preferences.auto_hide} disabled={preferences.edge==="free"} onChange={e=>patchPreferences({auto_hide:e.target.checked})}/>离开入口后自动收起</label><label className="manager-checkbox"><input type="checkbox" checked={preferences.topmost} onChange={e=>patchPreferences({topmost:e.target.checked})}/>悬浮入口置顶</label><Button type="submit" disabled={busy || !dirty}><Check size={15}/>保存桌面设置</Button></form>
        <h3>显示主题</h3><label>应用主题<select value={theme} onChange={e=>{const value=e.target.value==="dark"?"dark":"light";setTheme(value);const warning=writeTheme(value);if(warning)setError(warning);else setMessage("主题已保存。");}}><option value="dark">深色</option><option value="light">浅色</option></select></label><p className="manager-note">管理中心关闭后释放窗口；软件完整退出仍通过文件架或托盘执行。</p>
      </section>}
    </>}
    <footer className="manager-status" role="status">{message || "记录保存在本机，原文件保留。"}</footer></main>
  </div>;
}
