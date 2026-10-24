import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, ArrowDownToLine, Check, ChevronDown, File, Folder, FolderPlus, GripVertical, Grid2X2, Info, List, Moon, MoreHorizontal, Pin, Plus, RefreshCw, Search, Star, Sun, X } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { DropdownMenu } from "radix-ui";
import { ShelfMenu } from "./components/ShelfMenu";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "./components/ui/context-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./components/ui/sheet";
import { FileThumb } from "./components/spaceui/FileThumb";
import type { Backend, Item, Progress, Snapshot } from "./backend";
import { defaultView,readTheme,readViewMemory,writeTheme,writeViewMemory,type ShelfView } from "./preferences";
import { isSortMode,sortItems,sortOptions } from "./sorting";

const collision: CollisionDetection = args => { const hits=pointerWithin(args); return hits.length ? hits : closestCenter(args); };
const blank: Snapshot={shelves:[],items:[],jobs:[]};
const activeStatus=(s:string) => ["queued","copying"].includes(s);
const sizes=(n:number) => n>=1024*1024 ? `${(n/1024/1024).toFixed(1)} MB` : n>=1024 ? `${(n/1024).toFixed(1)} KB` : `${n} B`;
const states: Record<string,string>={ normal:"正常",missing:"引用失效",unreadable:"无法读取",unsupported:"不支持的链接" };
const jobStates: Record<string,string>={queued:"等待中",copying:"复制中",completed:"已完成",partial:"部分完成",failed:"失败",cancelled:"已取消",interrupted:"上次中断"};
const thumbCache=new Map<string,string|null>();
function Thumb({item,backend,size=80}:{item:Item;backend:Backend;size?:number}) {
  const key=JSON.stringify([item.id,item.path,item.modified,item.bytes]);
  const [thumb,setThumb]=useState<string|null>(thumbCache.get(key) || null);
  useEffect(() => {
    let live=true;
    if(item.status!=="normal" || !["png","jpg","jpeg","webp"].includes(item.kind)) { setThumb(null); return; }
    if(thumbCache.has(key)) { setThumb(thumbCache.get(key) || null); return; }
    setThumb(null);
    void backend.thumbnail(item.id).then(value => {
      if(thumbCache.size>=128) thumbCache.delete(thumbCache.keys().next().value!);
      thumbCache.set(key,value); if(live) setThumb(value);
    }).catch(()=>{ if(live) setThumb(null); });
    return ()=>{live=false;};
  },[backend,item.id,item.kind,item.status,key]);
  return <div className="thumb" style={{width:size,height:size}}>{thumb ? <FileThumb key={key} iconSrc={thumb} thumbnailSrc={thumb} size={size} frameClassName="rounded object-contain"/> : item.kind==="folder" ? <Folder size={size*.6}/> : <File size={size*.6}/>}</div>;
}
function Asset({item,backend,selected,list,size,disabled,select,inspect,open,tag,remove,bound}:{item:Item;backend:Backend;selected:boolean;list:boolean;size:number;disabled:boolean;select:()=>void;inspect:()=>void;open:()=>void;tag:()=>void;remove:()=>void;bound:boolean}) {
  const sortable=useSortable({id:item.id,disabled});
  return <ContextMenu><ContextMenuTrigger asChild><div ref={sortable.setNodeRef} data-item-id={item.id}
    className={`asset ${list?"asset-row":"asset-grid"} ${selected?"selected":""} ${sortable.isDragging?"dragging":""}`}
    style={{transform:CSS.Transform.toString(sortable.transform),transition:sortable.transition}}>
    <button ref={sortable.setActivatorNodeRef} className="drag-handle" disabled={disabled} aria-label={`调整 ${item.name} 顺序`} {...sortable.attributes} {...sortable.listeners}><GripVertical size={15}/></button>
    <button className="asset-select" aria-label={`选择 ${item.name}`} aria-pressed={selected} onClick={select} onDoubleClick={open} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(!e.repeat)open();}}}>
      <Thumb item={item} backend={backend} size={list?30:size}/><span className="asset-name" title={item.name}>{item.name}</span>
      <span className="asset-meta">{item.status!=="normal" ? states[item.status] : item.kind.toUpperCase()}{item.tags.includes("精选") && <Star size={12}/>}</span>
      {list && <span className="asset-bytes">{sizes(item.bytes)}</span>}
    </button>
  </div></ContextMenuTrigger><ContextMenuContent>
    <ContextMenuItem onSelect={open}>用系统默认程序打开</ContextMenuItem>
    <ContextMenuItem onSelect={inspect}>文件详情与预览</ContextMenuItem>
    <ContextMenuItem onSelect={tag}>{item.tags.includes("精选")?"移除精选标签":"标记精选"}</ContextMenuItem>
    <ContextMenuSeparator/><ContextMenuItem disabled={item.status!=="normal"} onSelect={()=>void backend.reveal(item.id).catch(()=>{})}>在资源管理器中定位</ContextMenuItem>
    <ContextMenuItem disabled={bound} onSelect={remove}>仅移除引用（保留原文件）</ContextMenuItem>
  </ContextMenuContent></ContextMenu>;
}
function VirtualFiles(props:{items:Item[];backend:Backend;selected:number|null;list:boolean;size:number;disabled:boolean;select:(id:number)=>void;inspect:(id:number)=>void;open:(id:number)=>void;tag:(item:Item)=>void;remove:(id:number)=>void;bound:boolean}) {
  const scroll=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(600);
  useEffect(()=>{ const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width)); if(scroll.current) observer.observe(scroll.current); return ()=>observer.disconnect(); },[]);
  const columns=props.list?1:Math.max(1,Math.floor(width/(props.size+40)));
  const virtual=useVirtualizer({count:Math.ceil(props.items.length/columns),getScrollElement:()=>scroll.current,estimateSize:()=>props.list?44:props.size+80,overscan:2,useFlushSync:false});
  useEffect(()=>virtual.measure(),[virtual,props.list,props.size,columns]);
  return <SortableContext items={props.items.map(i=>i.id)} strategy={rectSortingStrategy}><div ref={scroll} className="file-scroll" data-testid="file-scroll" tabIndex={0} aria-label="文件内容"><div className="virtual-space" style={{height:virtual.getTotalSize()}}>{virtual.getVirtualItems().map(row=><div className="virtual-row" key={row.key} style={{transform:`translateY(${row.start}px)`,height:row.size,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
    {props.items.slice(row.index*columns,(row.index+1)*columns).map(item=><Asset key={item.id} item={item} backend={props.backend} list={props.list} size={props.size} selected={item.id===props.selected} disabled={props.disabled} bound={props.bound} select={()=>props.select(item.id)} inspect={()=>props.inspect(item.id)} open={()=>props.open(item.id)} tag={()=>props.tag(item)} remove={()=>props.remove(item.id)}/>)}
  </div>)}</div></div></SortableContext>;
}
export default function App({backend,native}:{backend:Backend;native:boolean}) {
  const [data,setData]=useState<Snapshot>(blank),[shelfId,setShelfId]=useState(1),[selected,setSelected]=useState<number|null>(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const searchInput=useRef<HTMLInputElement>(null),searchButton=useRef<HTMLButtonElement>(null);
  const restoreSearchFocus=useRef(false);
  const [feedback,setFeedback]=useState(false);
  const [query,setQuery]=useState("");
  const [initialViews]=useState(readViewMemory);
  const [views,setViews]=useState(initialViews.views),[viewWarning,setViewWarning]=useState(initialViews.warning);
  const viewDirty=useRef(false);
  const {list,sort,size}=views[String(shelfId)] || defaultView;
  const [theme,setTheme]=useState(readTheme),[themeWarning,setThemeWarning]=useState("");
  const preferenceWarning=[viewWarning,themeWarning].filter(Boolean).join("；");
  const [details,setDetails]=useState(false),[preview,setPreview]=useState(false),[width,setWidth]=useState(innerWidth),[detailPinned,setDetailPinned]=useState(false);
  const [topmost,setTopmost]=useState(false),[hover,setHover]=useState(false),[dragging,setDragging]=useState<number|null>(null);
  const [message,setMessage]=useState("正在恢复文件架…"),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<Progress|null>(null),[tasks,setTasks]=useState(false);
  const [repairFeedback,setRepairFeedback]=useState<{error:boolean;message:string}|null>(null);
  const activeShelf=useRef(shelfId); activeShelf.current=shelfId;
  const importRef=useRef<(paths:string[])=>void>(()=>{});
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const shelf=data.shelves.find(s=>s.id===shelfId),bound=shelf?.kind==="bound";
  const items=data.items.filter(item=>item.shelf_id===shelfId);
  const visible=useMemo(()=>sortItems(data.items.filter(i=>i.shelf_id===shelfId && i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())),sort),[data.items,shelfId,query,sort]);
  const current=data.items.find(i=>i.id===selected),dragItem=data.items.find(i=>i.id===dragging);
  const running=data.jobs.find(j=>activeStatus(j.status));
  const inline=details && detailPinned && width>=1000;
  async function refresh() { const value=await backend.snapshot(); setData(value); return value; }
  function switchShelf(id:number) { setShelfId(id); setSelected(null); setQuery(""); setSearchOpen(false); setDetails(false); setPreview(false); }
  async function perform(action:()=>Promise<unknown>) { setError(""); try { await action(); } catch(e) { setError(String(e)); } }
  async function open(id:number) {
    setSelected(id);
    setError("");
    try {const opened=await backend.open(id);setMessage(opened?"已请求系统默认程序打开。":"已取消打开，文件引用保持不变。");}
    catch(e) {setError(String(e));setMessage("打开未完成，请检查错误提示。");}
  }
  async function receive(paths:string[]) {
    if(!paths.length) return;
    setBusy(true); setError("");
    try {
      const result=await backend.importPaths(activeShelf.current,paths);
      setMessage(result.job_id ? "复制任务已开始；来源保留。" : `已处理 ${result.added} 项引用；原文件保持不变。`);
      if(result.errors.length) setError(result.errors.join("；"));
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
  useEffect(()=>{ document.documentElement.className=theme;setThemeWarning(writeTheme(theme)); },[theme]);
  function setView(patch:Partial<ShelfView>) {
    viewDirty.current=true;
    setViews(previous=>({...previous,[shelfId]:{...(previous[String(shelfId)] || defaultView),...patch}}));
  }
  useEffect(()=>{
    if(!viewDirty.current)return;
    viewDirty.current=false;setViewWarning(writeViewMemory(views,initialViews.writable));
  },[views,initialViews.writable]);
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
  useLayoutEffect(()=>{
    if(searchOpen)searchInput.current?.focus();
    else if(restoreSearchFocus.current){restoreSearchFocus.current=false;searchButton.current?.focus();}
  },[searchOpen]);
  useEffect(()=>{
    if(message==="文件架已恢复。" || message==="正在恢复文件架…")return;
    setFeedback(true);const timer=setTimeout(()=>setFeedback(false),4500);return()=>clearTimeout(timer);
  },[message]);
  function closeSearch(){restoreSearchFocus.current=true;setQuery("");setSearchOpen(false);}
  useEffect(()=>{
    const fn=(e:KeyboardEvent)=>{if(e.isComposing || e.defaultPrevented || (e.target instanceof HTMLElement && e.target.closest('[role="dialog"],[role="menu"]')))return;
      if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="f"){e.preventDefault();setSearchOpen(true);searchInput.current?.focus();}
    };window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn);
  },[]);
  async function tag(item:Item) { await perform(async()=>{await backend.tags(item.id,item.tags.includes("精选")?item.tags.filter(t=>t!=="精选"):[...item.tags,"精选"]);await refresh();}); }
  async function remove(id:number) { await perform(async()=>{await backend.remove(id);setSelected(null);setDetails(false);await refresh();setMessage("已移除引用，原文件保留。");}); }
  useEffect(()=>setRepairFeedback(null),[selected,shelfId]);
  async function relocate(id:number,directory:boolean) {
    setBusy(true);setRepairFeedback(null);
    let updated=false;
    try {
      updated=await backend.relocate(id,directory);
      await refresh();
      const message=updated?"引用已重新定位，标签与手动顺序已保留。":"已取消重新定位，原引用未更改。";
      setMessage(message);if(!updated)setRepairFeedback({error:false,message});
    } catch(e) {
      const reason=e instanceof Error?e.message:String(e);
      setRepairFeedback({error:true,message:updated?`引用已更新，但刷新失败。请关闭详情后刷新状态：${reason}`:reason});
      setMessage(updated?"引用已更新，但状态刷新失败，请刷新重试。":"重新定位未完成，原引用未更改。");
    }
    finally {setBusy(false);}
  }
  const detail=current && <div className="file-details"><div className="detail-preview"><Thumb item={current} backend={backend} size={preview?220:160}/></div><h3>{current.name}</h3>
    <Badge variant="secondary">{states[current.status] || current.status}</Badge><dl><dt>原始路径</dt><dd>{current.path}</dd><dt>类型</dt><dd>{current.kind.toUpperCase()}</dd><dt>大小</dt><dd>{sizes(current.bytes)}</dd><dt>修改日期</dt><dd>{current.modified?new Date(current.modified*1000).toLocaleString():"不可用"}</dd><dt>标签</dt><dd>{current.tags.join("、") || "无"}</dd></dl>
    {current.status!=="normal" && <p>{bound?"记录与标签已保留，请恢复绑定目录后刷新；这里不会更改目录绑定。":"记录与标签已保留。恢复原路径后刷新，或手动重新定位；不会自动扫描磁盘。"}</p>}
    {!bound && ["missing","unreadable"].includes(current.status) && <section className="reference-repair" aria-label="重新定位失效引用" aria-busy={busy}>
      <p>选择你确认的原文件或文件夹，再核对新位置。只修改引用，标签与顺序保留。</p>
      <div><Button variant="outline" disabled={!native || busy} onClick={()=>void relocate(current.id,false)}>重新定位文件</Button><Button variant="outline" disabled={!native || busy} onClick={()=>void relocate(current.id,true)}>重新定位文件夹</Button></div>
      {repairFeedback && <p role={repairFeedback.error?"alert":"status"}>{repairFeedback.message}</p>}
    </section>}
    <Button variant="outline" onClick={()=>void tag(current)}><Star size={14}/>切换精选标签</Button><p className="muted">图片预览按需加载 PNG / JPEG / WebP；其他类型保留图标。</p></div>;
  return <div className={`workstation ${hover?"drop-active":""}`}>
    <header className="shelf-header" data-tauri-drag-region>
      {searchOpen ? <div className="shelf-search"><Search size={16}/><Input ref={searchInput} aria-label="搜索文件" placeholder="搜索当前文件架" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Escape" && !e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();closeSearch();}}}/><Button variant="ghost" size="icon" aria-label="关闭搜索" onClick={closeSearch}><X size={16}/></Button></div> : <>
        <ShelfMenu label="文件架" align="start" trigger={<Button className="shelf-switch" variant="ghost" aria-label="切换文件架">{bound?<Folder size={16}/>:<Archive size={16}/>}<span>{shelf?.name || "文件架"}</span><ChevronDown size={14}/></Button>}>
          <DropdownMenu.RadioGroup value={String(shelfId)} onValueChange={id=>switchShelf(Number(id))}>{data.shelves.map(s=><DropdownMenu.RadioItem key={s.id} value={String(s.id)}>{s.kind==="bound"?<Folder size={16}/>:<Archive size={16}/>}<span>{s.name}</span><DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
          <DropdownMenu.Separator/><DropdownMenu.Item disabled={!native || busy || !!running} onSelect={()=>void perform(async()=>{const id=await backend.chooseFolder();await refresh();if(id)switchShelf(id);})}><FolderPlus size={16}/>绑定文件夹</DropdownMenu.Item>
        </ShelfMenu>
        <Button ref={searchButton} variant="ghost" size="icon" aria-label="搜索文件" title="搜索文件 Ctrl+F" onClick={()=>setSearchOpen(true)}><Search size={16}/></Button>
      </>}
      <Button className="add-files" variant="ghost" size="icon" disabled={!native || busy || !!running} aria-label={bound?"添加并复制":"添加引用"} title={bound?"添加并复制，保留来源":"添加引用，保留原文件"} onClick={()=>void perform(async()=>receive(await backend.chooseFiles()))}><Plus size={18}/></Button>
      <ShelfMenu label="更多操作" trigger={<Button variant="ghost" size="icon" aria-label="更多操作" title="更多操作"><MoreHorizontal size={18}/></Button>}>
        <DropdownMenu.Label className="menu-label">显示与排序</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={list?"list":"grid"} onValueChange={v=>setView({list:v==="list"})}><DropdownMenu.RadioItem value="grid"><Grid2X2 size={16}/>网格视图<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem><DropdownMenu.RadioItem value="list"><List size={16}/>详细列表<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem></DropdownMenu.RadioGroup>
        <DropdownMenu.RadioGroup value={sort} onValueChange={v=>{if(isSortMode(v))setView({sort:v});}}>{sortOptions.map(option=><DropdownMenu.RadioItem key={option.value} value={option.value}>{option.label}<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
        <DropdownMenu.Label className="menu-label">缩略图大小</DropdownMenu.Label><DropdownMenu.RadioGroup className="thumbnail-choices" aria-label="缩略图大小" value={String(size)} onValueChange={v=>setView({size:v==="60"?60:v==="120"?120:80})}>{[[60,"小"],[80,"中"],[120,"大"]].map(([v,label])=><DropdownMenu.RadioItem key={v} aria-label={label+"缩略图"} value={String(v)}>{label}<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
        <DropdownMenu.Separator/>
        <DropdownMenu.Item disabled={loading} onSelect={()=>void perform(async()=>{await refresh();setMessage("已刷新文件状态。");})}><RefreshCw size={16}/>刷新文件状态</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={()=>setTasks(true)}>复制任务</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={16}/>:<Moon size={16}/>}切换{theme==="dark"?"浅色":"深色"}主题</DropdownMenu.Item>
        <DropdownMenu.CheckboxItem disabled={!native} checked={topmost} onCheckedChange={()=>void perform(async()=>setTopmost(await backend.topmost()))}><Pin size={16}/>窗口置顶<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>
        <DropdownMenu.Separator/><DropdownMenu.Item disabled={!native} onSelect={()=>void perform(()=>backend.quit())}>完整退出</DropdownMenu.Item>
      </ShelfMenu>
    </header>
    <div className="shelf-context" data-dropping={hover}><span className="shelf-semantics" title={bound?(shelf?.available?shelf.root || "":"绑定目录离线或不可读，保留原记录"):shelf?.kind==="session"?"完整退出后只清空引用，原文件保留":"持久保存引用，原文件保留"}>{hover?(bound?"释放以复制 · 保留来源":"释放以添加引用 · 保留原文件"):bound?"复制到目录 · 保留来源":shelf?.kind==="session"?"本次中转 · 仅保存引用":"仅保存引用"}</span><div className="selection-actions">{current && <><Button variant="ghost" size="sm" aria-label="详情" onClick={()=>setDetails(true)}><Info size={14}/>详情</Button><Button variant="ghost" size="sm" disabled={current.status!=="normal"} title="按住左键拖到目标，默认复制" onPointerDown={e=>{if(e.button===0)void perform(()=>backend.drag([current.id]));}} onKeyDown={e=>{if(e.key==="Enter")setMessage("请用鼠标按住“拖出复制”并拖向目标窗口。");}}><ArrowDownToLine size={14}/>拖出复制</Button></>}</div></div>
    {bound && !shelf.available && <p className="offline-note" role="status">目录离线，记录已保留 · 恢复目录后刷新</p>}
    {preferenceWarning && <div className="error-bar" role="alert"><span>{preferenceWarning}</span><Button variant="ghost" size="icon" aria-label="关闭设置提示" onClick={()=>{setViewWarning("");setThemeWarning("");}}><X size={15}/></Button></div>}
    {error && <div className="error-bar" role="alert"><span>{error}</span><Button variant="ghost" size="icon" aria-label="关闭错误提示" onClick={()=>setError("")}><X size={15}/></Button></div>}
    <div className="explorer-and-details"><main className="explorer-pane">
      {loading?<div className="empty-state"><p>正在恢复本地文件架…</p></div>:<DndContext sensors={sensors} collisionDetection={collision} onDragStart={e=>setDragging(Number(e.active.id))} onDragCancel={()=>setDragging(null)} onDragEnd={event=>{
        setDragging(null); if(!event.over || event.over.id===event.active.id) return;
        const ids=items.map(i=>i.id),from=ids.indexOf(Number(event.active.id)),to=ids.indexOf(Number(event.over.id));
        if(from<0 || to<0) return;
        void perform(async()=>{await backend.reorder(shelfId,arrayMove(ids,from,to));await refresh();setMessage("手动顺序已保存，磁盘文件保持不变。");});
      }}>
        {visible.length?<VirtualFiles items={visible} backend={backend} selected={selected} list={list} size={size} disabled={sort!=="manual" || !!query} bound={!!bound} select={setSelected} inspect={id=>{setSelected(id);setDetails(true);}} open={id=>void open(id)} tag={item=>void tag(item)} remove={id=>void remove(id)}/>:<div className="empty-state"><Folder size={32}/><h2>{query?"没有匹配的文件":bound?"拖入文件，安全复制":"拖入文件，添加引用"}</h2><p>{query?"试试其他名称":bound?"重名自动编号，保留原文件":"保留原文件，或点击右上角添加"}</p>{query && <Button variant="outline" onClick={()=>setQuery("")}>清除搜索</Button>}</div>}
        <DragOverlay>{dragItem && <div className="drag-preview" data-testid="drag-preview"><Thumb item={dragItem} backend={backend} size={45}/><span>{dragItem.name}</span><small>调整引用顺序</small></div>}</DragOverlay>
      </DndContext>}
    </main>{inline && current && <aside className="inspector"><header><h2>文件详情</h2><Button variant="ghost" size="icon" aria-label="关闭详情" onClick={()=>setDetails(false)}><X size={15}/></Button></header>{detail}</aside>}</div>
    {running && <button className="compact-progress" aria-label="查看复制任务" onClick={()=>setTasks(true)}><span>{progress?`复制中 · ${progress.file_index}/${progress.file_count}`:"复制中"}</span><progress aria-label="当前文件复制进度" value={progress?.bytes || 0} max={Math.max(1,progress?.total || 1)}/><span>查看</span></button>}
    <footer className={`file-status ${feedback && !running && !error && !preferenceWarning?"status-toast":"sr-only"}`} role="status">{message}</footer>
    <Sheet open={tasks} onOpenChange={setTasks}><SheetContent className="details-sheet" showCloseButton={false}><SheetClose asChild><Button className="sheet-dismiss" variant="ghost" size="icon" aria-label="关闭复制任务"><X size={16}/></Button></SheetClose><SheetHeader><SheetTitle>复制任务</SheetTitle><SheetDescription>来源保留，失败与中断记录不会自动清理</SheetDescription></SheetHeader><div className="task-list">
      {progress && <div className="copy-progress"><span>{progress.name} · {progress.file_index}/{progress.file_count}</span><progress aria-label="复制任务进度" value={progress.bytes} max={Math.max(1,progress.total)}/><span>{sizes(progress.bytes)} / {sizes(progress.total)}</span></div>}
      {!data.jobs.length && <p className="muted">暂无复制任务</p>}
      {data.jobs.map(job=><div className="job" key={job.id}><Badge variant={["failed","interrupted","partial"].includes(job.status)?"destructive":"secondary"}>{jobStates[job.status] || job.status}</Badge><span>{job.message}</span>{activeStatus(job.status) && <Button variant="outline" onClick={()=>void perform(()=>backend.cancel(job.id))}>取消复制</Button>}{job.status==="interrupted" && job.staging && <p className="muted">上次临时文件位置：{job.staging}（未自动删除）</p>}</div>)}
    </div></SheetContent></Sheet>
    <Sheet open={(details && !inline || preview) && !!current} onOpenChange={value=>{if(!value){setDetails(false);setPreview(false);}}}><SheetContent className="details-sheet" showCloseButton={false}><SheetClose asChild><Button className="sheet-dismiss" variant="ghost" size="icon" aria-label="关闭详情"><X size={16}/></Button></SheetClose><SheetHeader><SheetTitle>{preview?"快速预览":"文件详情"}</SheetTitle><SheetDescription>真实本地文件信息；移除引用保留原文件。</SheetDescription></SheetHeader>{width>=1000 && !preview && <Button variant="ghost" onClick={()=>setDetailPinned(true)}>固定到右侧</Button>}{detail}</SheetContent></Sheet>
  </div>;
}
