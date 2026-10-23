import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, ArrowDownToLine, File, Folder, FolderPlus, GripVertical, Grid2X2, Info, List, Moon, Pin, Plus, RefreshCw, Search, Star, Sun, X } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "./components/ui/context-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./components/ui/sheet";
import { FileThumb } from "./components/spaceui/FileThumb";
import type { Backend, Item, Progress, Snapshot } from "./backend";

const collision: CollisionDetection = args => { const hits=pointerWithin(args); return hits.length ? hits : closestCenter(args); };
const blank: Snapshot={shelves:[],items:[],jobs:[]};
const activeStatus=(s:string) => ["queued","copying"].includes(s);
const sizes=(n:number) => n>=1024*1024 ? `${(n/1024/1024).toFixed(1)} MB` : n>=1024 ? `${(n/1024).toFixed(1)} KB` : `${n} B`;
const states: Record<string,string>={ normal:"正常",missing:"引用失效",unreadable:"无法读取",unsupported:"不支持的链接" };
const jobStates: Record<string,string>={queued:"等待中",copying:"复制中",completed:"已完成",partial:"部分完成",failed:"失败",cancelled:"已取消",interrupted:"上次中断"};
const thumbCache=new Map<string,string|null>();
function Thumb({item,backend,size=80}:{item:Item;backend:Backend;size?:number}) {
  const key=`${item.id}:${item.modified}:${item.bytes}`;
  const [thumb,setThumb]=useState<string|null>(thumbCache.get(key) || null);
  useEffect(() => {
    let live=true;
    if(item.status!=="normal" || !["png","jpg","jpeg","webp"].includes(item.kind)) { setThumb(null); return; }
    if(thumbCache.has(key)) { setThumb(thumbCache.get(key) || null); return; }
    void backend.thumbnail(item.id).then(value => {
      if(thumbCache.size>=128) thumbCache.delete(thumbCache.keys().next().value!);
      thumbCache.set(key,value); if(live) setThumb(value);
    }).catch(()=>{ if(live) setThumb(null); });
    return ()=>{live=false;};
  },[backend,item.id,item.kind,item.status,key]);
  return <div className="thumb" style={{width:size,height:size}}>{thumb ? <FileThumb key={key} iconSrc={thumb} thumbnailSrc={thumb} size={size} frameClassName="rounded object-contain"/> : item.kind==="folder" ? <Folder size={size*.6}/> : <File size={size*.6}/>}</div>;
}
function Asset({item,backend,selected,list,size,disabled,select,inspect,tag,remove,bound}:{item:Item;backend:Backend;selected:boolean;list:boolean;size:number;disabled:boolean;select:()=>void;inspect:()=>void;tag:()=>void;remove:()=>void;bound:boolean}) {
  const sortable=useSortable({id:item.id,disabled});
  return <ContextMenu><ContextMenuTrigger asChild><div ref={sortable.setNodeRef} data-item-id={item.id}
    className={`asset ${list?"asset-row":"asset-grid"} ${selected?"selected":""} ${sortable.isDragging?"dragging":""}`}
    style={{transform:CSS.Transform.toString(sortable.transform),transition:sortable.transition}}>
    <button ref={sortable.setActivatorNodeRef} className="drag-handle" disabled={disabled} aria-label={`调整 ${item.name} 顺序`} {...sortable.attributes} {...sortable.listeners}><GripVertical size={15}/></button>
    <button className="asset-select" aria-label={`选择 ${item.name}`} aria-pressed={selected} onClick={select} onDoubleClick={inspect}>
      <Thumb item={item} backend={backend} size={list?30:size}/><span className="asset-name" title={item.name}>{item.name}</span>
      <span className="asset-meta">{item.status!=="normal" ? states[item.status] : item.kind.toUpperCase()}{item.tags.includes("精选") && <Star size={12}/>}</span>
      {list && <span className="asset-bytes">{sizes(item.bytes)}</span>}
    </button>
  </div></ContextMenuTrigger><ContextMenuContent>
    <ContextMenuItem onSelect={inspect}>文件详情与预览</ContextMenuItem>
    <ContextMenuItem onSelect={tag}>{item.tags.includes("精选")?"移除精选标签":"标记精选"}</ContextMenuItem>
    <ContextMenuSeparator/><ContextMenuItem disabled={item.status!=="normal"} onSelect={()=>void backend.reveal(item.id).catch(()=>{})}>在资源管理器中定位</ContextMenuItem>
    <ContextMenuItem disabled={bound} onSelect={remove}>仅移除引用（保留原文件）</ContextMenuItem>
  </ContextMenuContent></ContextMenu>;
}
function VirtualFiles(props:{items:Item[];backend:Backend;selected:number|null;list:boolean;size:number;disabled:boolean;select:(id:number)=>void;inspect:(id:number)=>void;tag:(item:Item)=>void;remove:(id:number)=>void;bound:boolean}) {
  const scroll=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(600);
  useEffect(()=>{ const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width)); if(scroll.current) observer.observe(scroll.current); return ()=>observer.disconnect(); },[]);
  const columns=props.list?1:Math.max(1,Math.floor(width/(props.size+64)));
  const virtual=useVirtualizer({count:Math.ceil(props.items.length/columns),getScrollElement:()=>scroll.current,estimateSize:()=>props.list?50:props.size+104,overscan:2,useFlushSync:false});
  return <SortableContext items={props.items.map(i=>i.id)} strategy={rectSortingStrategy}><div ref={scroll} className="file-scroll" data-testid="file-scroll" tabIndex={0} aria-label="文件内容"><div className="virtual-space" style={{height:virtual.getTotalSize()}}>{virtual.getVirtualItems().map(row=><div className="virtual-row" key={row.key} style={{transform:`translateY(${row.start}px)`,height:row.size,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
    {props.items.slice(row.index*columns,(row.index+1)*columns).map(item=><Asset key={item.id} item={item} backend={props.backend} list={props.list} size={props.size} selected={item.id===props.selected} disabled={props.disabled} bound={props.bound} select={()=>props.select(item.id)} inspect={()=>props.inspect(item.id)} tag={()=>props.tag(item)} remove={()=>props.remove(item.id)}/>)}
  </div>)}</div></div></SortableContext>;
}
export default function App({backend,native}:{backend:Backend;native:boolean}) {
  const [data,setData]=useState<Snapshot>(blank),[shelfId,setShelfId]=useState(1),[selected,setSelected]=useState<number|null>(null);
  const [query,setQuery]=useState(""),[sort,setSort]=useState("manual"),[list,setList]=useState(false),[size,setSize]=useState(80);
  const [theme,setTheme]=useState(()=>localStorage.getItem("ningmao-theme") || "dark");
  const [details,setDetails]=useState(false),[preview,setPreview]=useState(false),[width,setWidth]=useState(innerWidth),[detailPinned,setDetailPinned]=useState(false);
  const [topmost,setTopmost]=useState(false),[hover,setHover]=useState(false),[dragging,setDragging]=useState<number|null>(null);
  const [message,setMessage]=useState("正在恢复文件架…"),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<Progress|null>(null),[tasks,setTasks]=useState(false);
  const activeShelf=useRef(shelfId); activeShelf.current=shelfId;
  const importRef=useRef<(paths:string[])=>void>(()=>{});
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const shelf=data.shelves.find(s=>s.id===shelfId),bound=shelf?.kind==="bound";
  const items=data.items.filter(item=>item.shelf_id===shelfId);
  const visible=useMemo(()=>{ const filtered=data.items.filter(i=>i.shelf_id===shelfId && i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())); return sort==="name" ? filtered.sort((a,b)=>a.name.localeCompare(b.name,"zh-CN")):filtered; },[data.items,shelfId,query,sort]);
  const current=data.items.find(i=>i.id===selected),dragItem=data.items.find(i=>i.id===dragging);
  const running=data.jobs.find(j=>activeStatus(j.status));
  const inline=details && detailPinned && width>=1000;
  async function refresh() { const value=await backend.snapshot(); setData(value); return value; }
  function switchShelf(id:number) { setShelfId(id); setSelected(null); setQuery(""); setDetails(false); setPreview(false); }
  async function perform(action:()=>Promise<unknown>) { setError(""); try { await action(); } catch(e) { setError(String(e)); } }
  async function receive(paths:string[]) {
    if(!paths.length) return;
    setBusy(true); setError("");
    try {
      const result=await backend.importPaths(activeShelf.current,paths);
      setMessage(result.job_id ? "复制任务已开始；来源保留。" : `已处理 ${result.added} 项引用；原文件保持不变。`);
      if(result.errors.length) setError(result.errors.join("；"));
      if(result.job_id) setTasks(true);
      await refresh();
    } catch(e) { setError(String(e)); } finally { setBusy(false); }
  }
  importRef.current=paths=>void receive(paths);
  useEffect(()=>{
    let live=true; let cleanup:(()=>void)|undefined;
    void backend.subscribe({
      drop:paths=>importRef.current(paths),hover:setHover,progress:setProgress,
      finished:message=>{setMessage(message);setProgress(null);void refresh().catch(e=>setError(String(e)));},
      drag:message=>setMessage(`系统拖出结果：${message}；已请求复制。`),
    }).then(fn=>{if(live) cleanup=fn;else fn();}).catch(e=>setError(String(e)));
    void refresh().then(()=>{if(live) {setMessage("文件架已恢复。");setLoading(false);}}).catch(e=>{if(live) {setError(String(e));setLoading(false);}});
    return ()=>{live=false;cleanup?.();};
  },[backend]);
  useEffect(()=>{ document.documentElement.className=theme;localStorage.setItem("ningmao-theme",theme); },[theme]);
  useEffect(()=>{ const fn=()=>setWidth(innerWidth);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn); },[]);
  useEffect(()=>{
    if(!running) return;
    const timer=setInterval(()=>void refresh().catch(e=>setError(String(e))),1200);
    return()=>clearInterval(timer);
  },[running?.id,backend]);
  useEffect(()=>{
    const fn=(e:KeyboardEvent)=>{
      if(e.defaultPrevented || e.isComposing || (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable],.drag-handle,[role=dialog],[role=menu]"))) return;
      if(e.code==="Space" && selected) {e.preventDefault();setPreview(true);}
      if(e.key==="Escape") {setPreview(false);setDetails(false);}
      if(e.key==="Delete" && selected && !bound) void perform(async()=>{await backend.remove(selected);setSelected(null);await refresh();setMessage("已移除引用，原文件保留。");});
    };
    window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn);
  },[selected,bound,backend]);
  async function tag(item:Item) { await perform(async()=>{await backend.tags(item.id,item.tags.includes("精选")?item.tags.filter(t=>t!=="精选"):[...item.tags,"精选"]);await refresh();}); }
  async function remove(id:number) { await perform(async()=>{await backend.remove(id);setSelected(null);setDetails(false);await refresh();setMessage("已移除引用，原文件保留。");}); }
  const detail=current && <div className="file-details"><div className="detail-preview"><Thumb item={current} backend={backend} size={preview?260:180}/></div><h3>{current.name}</h3>
    <Badge variant="secondary">{states[current.status] || current.status}</Badge><dl><dt>原始路径</dt><dd>{current.path}</dd><dt>类型</dt><dd>{current.kind.toUpperCase()}</dd><dt>大小</dt><dd>{sizes(current.bytes)}</dd><dt>修改日期</dt><dd>{current.modified?new Date(current.modified*1000).toLocaleString():"不可用"}</dd><dt>标签</dt><dd>{current.tags.join("、") || "无"}</dd></dl>
    {current.status!=="normal" && <p>记录与标签已保留。恢复原路径后点击刷新；本阶段不自动扫描磁盘修复。</p>}
    <Button variant="outline" onClick={()=>void tag(current)}><Star size={14}/>切换精选标签</Button><p className="muted">图片预览按需加载 PNG / JPEG / WebP；其他类型保留图标。</p></div>;
  return <div className={`workstation ${hover?"drop-active":""}`}>
    <header className="appbar"><div className="brand"><Archive size={21}/><strong>柠猫文件工作站</strong><span>M1-05 候选</span></div><div className="appbar-actions">
      <Button variant="ghost" size="icon" aria-label={theme==="dark"?"切换浅色主题":"切换深色主题"} onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}</Button>
      <Button variant="ghost" size="icon" disabled={!native} aria-label="窗口置顶" aria-pressed={topmost} onClick={()=>void perform(async()=>setTopmost(await backend.topmost()))}><Pin size={17}/></Button>
      <Button variant="ghost" disabled={!native} onClick={()=>void perform(()=>backend.quit())}>完整退出</Button>
    </div></header>
    <div className="shelf-bar"><Tabs value={String(shelfId)} onValueChange={value=>switchShelf(Number(value))}><TabsList>{data.shelves.map(s=><TabsTrigger key={s.id} value={String(s.id)}>{s.kind==="bound"?<Folder size={14}/>:<Archive size={14}/>}<span>{s.name}</span></TabsTrigger>)}</TabsList></Tabs>
      <Button variant="outline" disabled={!native || busy || !!running} onClick={()=>void perform(async()=>{const id=await backend.chooseFolder();await refresh();if(id) switchShelf(id);})}><FolderPlus size={15}/>绑定文件夹</Button></div>
    <section className="content-heading"><div><h1>{shelf?.name || "文件架"}</h1><p>{bound?"复制到绑定目录 · 保留来源":shelf?.kind==="session"?"本次中转 · 完整退出后只清空引用":"持久收集 · 仅保存引用"}<span>{visible.length} 项</span></p></div><label className="search-box"><Search size={16}/><Input aria-label="搜索文件" placeholder="搜索文件名称…" value={query} onChange={e=>setQuery(e.target.value)}/></label></section>
    {bound && <div className="bound-path" title={shelf.root || ""}>{shelf.available?shelf.root:"绑定目录离线或不可读；保留原记录，请恢复目录后刷新。"}</div>}
    <div className="toolbar"><div className="view-controls"><Button variant="outline" disabled={!native || busy || !!running} onClick={()=>void perform(async()=>receive(await backend.chooseFiles()))}><Plus size={15}/>{bound?"添加并复制":"添加引用"}</Button>
      <Button variant="ghost" size="icon" aria-label="刷新文件状态" disabled={loading} onClick={()=>void perform(async()=>{await refresh();setMessage("已刷新文件状态。");})}><RefreshCw size={16}/></Button>
      <Button variant="ghost" size="icon" aria-label="网格视图" aria-pressed={!list} onClick={()=>setList(false)}><Grid2X2 size={16}/></Button>
      <Button variant="ghost" size="icon" aria-label="详细列表" aria-pressed={list} onClick={()=>setList(true)}><List size={16}/></Button>
      <select aria-label="排序方式" value={sort} onChange={e=>setSort(e.target.value)}><option value="manual">手动顺序</option><option value="name">名称排序</option></select>
      {!list && <input className="size-control" aria-label="缩略图大小" type="range" min="60" max="120" step="10" value={size} onChange={e=>setSize(Number(e.target.value))}/>}
    </div><div className="selection-actions">{current && <><Button variant="ghost" onClick={()=>setDetails(true)}><Info size={14}/>详情</Button>
      <Button variant="outline" disabled={current.status!=="normal"} title="按住左键拖到资源管理器空白处，默认复制" onPointerDown={e=>{if(e.button===0) void perform(()=>backend.drag([current.id]));}} onKeyDown={e=>{if(e.key==="Enter")setMessage("请用鼠标按住“拖出复制”并拖向目标窗口。");}}><ArrowDownToLine size={15}/>拖出复制</Button></>}</div></div>
    {error && <div className="error-bar" role="alert"><span>{error}</span><Button variant="ghost" size="icon" aria-label="关闭错误提示" onClick={()=>setError("")}><X size={15}/></Button></div>}
    <div className="explorer-and-details"><main className="explorer-pane">
      {loading?<div className="empty-state"><p>正在恢复本地文件架…</p></div>:<DndContext sensors={sensors} collisionDetection={collision} onDragStart={e=>setDragging(Number(e.active.id))} onDragCancel={()=>setDragging(null)} onDragEnd={event=>{
        setDragging(null); if(!event.over || event.over.id===event.active.id) return;
        const ids=items.map(i=>i.id),from=ids.indexOf(Number(event.active.id)),to=ids.indexOf(Number(event.over.id));
        if(from<0 || to<0) return;
        void perform(async()=>{await backend.reorder(shelfId,arrayMove(ids,from,to));await refresh();setMessage("手动顺序已保存，磁盘文件保持不变。");});
      }}>
        {visible.length?<VirtualFiles items={visible} backend={backend} selected={selected} list={list} size={size} disabled={sort!=="manual" || !!query} bound={!!bound} select={setSelected} inspect={id=>{setSelected(id);setDetails(true);}} tag={item=>void tag(item)} remove={id=>void remove(id)}/>:<div className="empty-state"><Folder size={32}/><h2>{query?"没有匹配的文件":bound?"将文件拖入这里，安全复制到目录":"将文件拖入这里，建立引用"}</h2><p>{query?"更换搜索词或清空筛选。":bound?"同名文件自动编号，原文件和已有目标均保留。":"不会移动、复制或删除原文件。也可以点击“添加引用”。"}</p>{query && <Button variant="outline" onClick={()=>setQuery("")}>清除搜索</Button>}</div>}
        <DragOverlay>{dragItem && <div className="drag-preview" data-testid="drag-preview"><Thumb item={dragItem} backend={backend} size={45}/><span>{dragItem.name}</span><small>调整引用顺序</small></div>}</DragOverlay>
      </DndContext>}
    </main>{inline && current && <aside className="inspector"><header><h2>文件详情</h2><Button variant="ghost" size="icon" aria-label="关闭详情" onClick={()=>setDetails(false)}><X size={15}/></Button></header>{detail}</aside>}</div>
    <details className="task-center" open={tasks} onToggle={e=>setTasks(e.currentTarget.open)}><summary>复制任务{running?" · 进行中":` · ${data.jobs.length} 条记录`}</summary><div className="task-list">
      {progress && <div className="copy-progress"><span>{progress.name} · {progress.file_index}/{progress.file_count}</span><progress aria-label="当前文件复制进度" value={progress.bytes} max={Math.max(1,progress.total)}/><span>{sizes(progress.bytes)} / {sizes(progress.total)}</span></div>}
      {!data.jobs.length && <p className="muted">复制任务会显示在这里；添加临时引用无需复制。</p>}
      {data.jobs.map(job=><div className="job" key={job.id}><Badge variant={["failed","interrupted","partial"].includes(job.status)?"destructive":"secondary"}>{jobStates[job.status] || job.status}</Badge><span>{job.message}</span>{activeStatus(job.status) && <Button variant="outline" onClick={()=>void perform(()=>backend.cancel(job.id))}>取消复制</Button>}{job.status==="interrupted" && job.staging && <p className="muted">上次临时文件位置：{job.staging}（未自动删除）</p>}</div>)}
    </div></details>
    <footer className="file-status" role="status"><span>{message}</span><span>{native?"本地文件 · SQLite":"浏览器预览"}</span></footer>
    <Sheet open={(details && !inline || preview) && !!current} onOpenChange={value=>{if(!value){setDetails(false);setPreview(false);}}}><SheetContent className="details-sheet"><SheetHeader><SheetTitle>{preview?"快速预览":"文件详情"}</SheetTitle><SheetDescription>真实本地文件信息；移除引用保留原文件。</SheetDescription></SheetHeader>{width>=1000 && !preview && <Button variant="ghost" onClick={()=>setDetailPinned(true)}>固定到右侧</Button>}{detail}</SheetContent></Sheet>
    {hover && <div className="drop-indicator" role="status">{bound?"释放后复制到绑定目录，保留来源":"释放后建立引用，原文件保持不变"}</div>}
  </div>;
}
