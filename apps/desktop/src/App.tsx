import {WindowControls} from "./components/WindowControls";
import {SystemRecycle} from "./components/SystemRecycle";
import {RecycleDrawer} from "./components/RecycleDrawer";
import {ScrollActivity} from "./components/ScrollActivity";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, Trash2, ArrowDownToLine, Check, ChevronDown, File, Folder, FolderPlus, GripVertical, Grid2X2, Info, List, Moon, MoreHorizontal, Pin, Plus, RefreshCw, Search, Star, Sun, X } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { DropdownMenu } from "radix-ui";
import { useWindowDrag } from "./orb/useWindowDrag";
import { ShelfMenu } from "./components/ShelfMenu";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "./components/ui/context-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./components/ui/sheet";
import { FileThumb } from "./components/spaceui/FileThumb";
import type { Backend, CatalogShelf, DesktopView, Item, Progress, Snapshot } from "./backend";
import { defaultView,observeTheme,readTheme,readViewMemory,writeTheme,writeShelfView,type ShelfView } from "./preferences";
import { isSortMode,sortItems,sortOptions } from "./sorting";
import {OrbFace} from "./orb/OrbFace";
import { defaultFilters,filterItems,type ShelfFilters } from "./filters";

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
type SelectionKeys={ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean};
function Asset({item,backend,selected,list,size,disabled,select,inspect,open,drag,tag,remove}:{item:Item;backend:Backend;selected:boolean;list:boolean;size:number;disabled:boolean;select:(keys:SelectionKeys)=>void;inspect:()=>void;open:()=>void;drag:()=>void;tag:()=>void;remove:()=>void;bound:boolean}) {
  const sortable=useSortable({id:item.id,disabled});
  const press=useRef<{x:number;y:number}|null>(null),nativeDrag=useRef(false);
  return <ContextMenu><ContextMenuTrigger asChild><div ref={sortable.setNodeRef} data-item-id={item.id}
    className={`asset ${list?"asset-row":"asset-grid"} ${selected?"selected":""} ${sortable.isDragging?"dragging":""}`}
    style={{transform:CSS.Transform.toString(sortable.transform),transition:sortable.transition}}>
    <button ref={sortable.setActivatorNodeRef} className="drag-handle" disabled={disabled} aria-label={`调整 ${item.name} 顺序`} {...sortable.attributes} {...sortable.listeners}><GripVertical size={15}/></button>
    <button className="asset-select" aria-label={`选择 ${item.name}`} aria-pressed={selected} draggable={false} title={item.status==="normal"?"拖动以复制；六点手柄调整顺序":undefined}
      onDragStart={e=>e.preventDefault()}
      onPointerDown={e=>{nativeDrag.current=false;press.current=null;if(e.button===0 && e.pointerType==="mouse" && item.status==="normal"){press.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}}
      onPointerMove={e=>{const start=press.current;if(!(e.buttons&1)){press.current=null;return;}if(start && Math.hypot(e.clientX-start.x,e.clientY-start.y)>=6){press.current=null;nativeDrag.current=true;e.preventDefault();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);drag();}}}
      onPointerUp={()=>{press.current=null;}} onPointerCancel={()=>{press.current=null;}} onLostPointerCapture={()=>{press.current=null;}}
      onClick={e=>{if(nativeDrag.current){e.preventDefault();e.stopPropagation();}else select(e);}} onDoubleClick={()=>{if(!nativeDrag.current)open();}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(!e.repeat)open();}}}>
      <Thumb item={item} backend={backend} size={list?30:size}/><span className="asset-name" title={item.name}>{item.name}</span>
      <span className="asset-meta">{item.status!=="normal" ? states[item.status] : item.kind.toUpperCase()}{item.tags.includes("精选") && <Star size={12}/>}</span>
      {list && <span className="asset-bytes">{sizes(item.bytes)}</span>}
    </button>
  </div></ContextMenuTrigger><ContextMenuContent>
    <ContextMenuItem onSelect={open}>用系统默认程序打开</ContextMenuItem>
    <ContextMenuItem onSelect={inspect}>文件详情与预览</ContextMenuItem>
    <ContextMenuItem onSelect={tag}>{item.tags.includes("精选")?"移除精选标签":"标记精选"}</ContextMenuItem>
    <ContextMenuSeparator/><ContextMenuItem disabled={item.status!=="normal"} onSelect={()=>void backend.reveal(item.id).catch(()=>{})}>在资源管理器中定位</ContextMenuItem>
    <ContextMenuItem onSelect={remove}>移入柠猫回收站（保留原文件）</ContextMenuItem>
  </ContextMenuContent></ContextMenu>;
}
function VirtualFiles(props:{items:Item[];backend:Backend;selected:number[];list:boolean;size:number;disabled:boolean;select:(id:number,keys:SelectionKeys)=>void;marquee:(ids:number[])=>void;inspect:(id:number)=>void;open:(id:number)=>void;drag:(id:number)=>void;tag:(item:Item)=>void;remove:(id:number)=>void;bound:boolean}) {
  const scroll=useRef<HTMLDivElement>(null),space=useRef<HTMLDivElement>(null),frame=useRef(0);
  const [width,setWidth]=useState(600);
  const [box,setBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  const gesture=useRef<{x:number;y:number;initialX:number;initialY:number;clientX:number;clientY:number;base:number[];mode:"replace"|"add"|"toggle";moved:boolean}|null>(null);
  useEffect(()=>{ const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width)); if(scroll.current) observer.observe(scroll.current); return ()=>observer.disconnect(); },[]);
  const columns=props.list?1:Math.max(1,Math.floor(width/(props.size+40)));
  const rowHeight=props.list?44:props.size+80;
  const virtual=useVirtualizer({count:Math.ceil(props.items.length/columns),getScrollElement:()=>scroll.current,estimateSize:()=>rowHeight,overscan:2,useFlushSync:false});
  useEffect(()=>virtual.measure(),[virtual,props.list,props.size,columns]);
  function updateBox(){
    const start=gesture.current;if(!start || !space.current)return;
    const rect=space.current.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,start.clientX-rect.left)),y=Math.max(0,Math.min(virtual.getTotalSize(),start.clientY-rect.top));
    if(!start.moved && Math.hypot(start.clientX-start.initialX,start.clientY-start.initialY)<4)return;
    start.moved=true;
    const area={left:Math.min(start.x,x),top:Math.min(start.y,y),width:Math.abs(start.x-x),height:Math.abs(start.y-y)};setBox(area);
    const tileWidth=(rect.width-8*(columns-1))/columns,hit=new Set<number>();
    // Fixed virtual row geometry includes items not mounted in the DOM.
    props.items.forEach((item,index)=>{const left=(index%columns)*(tileWidth+8),top=Math.floor(index/columns)*rowHeight;if(left<area.left+area.width && left+tileWidth>area.left && top<area.top+area.height && top+rowHeight-(props.list?0:12)>area.top)hit.add(item.id);});
    const base=new Set(start.base);
    props.marquee(props.items.filter(item=>start.mode==="toggle"?base.has(item.id)!==hit.has(item.id):hit.has(item.id) || start.mode==="add" && base.has(item.id)).map(item=>item.id));
  }
  function finishBox(cancel=false){const start=gesture.current;if(!start)return;gesture.current=null;cancelAnimationFrame(frame.current);setBox(null);if(cancel)props.marquee(start.base);else if(!start.moved && start.mode==="replace")props.marquee([]);}
  useEffect(()=>{const cancel=()=>finishBox(true);window.addEventListener("blur",cancel);return()=>{window.removeEventListener("blur",cancel);cancelAnimationFrame(frame.current);};},[]);
  useEffect(()=>{finishBox(true);},[props.items,props.list,props.size,columns]);
  return <SortableContext items={props.items.map(i=>i.id)} strategy={rectSortingStrategy}><div ref={scroll} className="file-scroll" data-testid="file-scroll" tabIndex={0} aria-label="文件内容"
    onPointerDown={e=>{
      // React portal menus bubble here; only the actual file-area DOM may start a box.
      if(e.button!==0 || e.pointerType!=="mouse" || !e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest('[data-item-id],button,input,select'))return;
      if(e.clientX>=e.currentTarget.getBoundingClientRect().left+e.currentTarget.clientWidth)return;
      const rect=space.current!.getBoundingClientRect();gesture.current={x:Math.max(0,Math.min(rect.width,e.clientX-rect.left)),y:Math.max(0,Math.min(virtual.getTotalSize(),e.clientY-rect.top)),initialX:e.clientX,initialY:e.clientY,clientX:e.clientX,clientY:e.clientY,base:props.selected,mode:e.ctrlKey || e.metaKey?"toggle":e.shiftKey?"add":"replace",moved:false};
      e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
      const tick=()=>{const start=gesture.current,area=scroll.current;if(!start || !area)return;if(start.moved){const bounds=area.getBoundingClientRect(),delta=start.clientY<bounds.top+24?-12:start.clientY>bounds.bottom-24?12:0,before=area.scrollTop;if(delta)area.scrollTop+=delta;if(area.scrollTop!==before)updateBox();}frame.current=requestAnimationFrame(tick);};frame.current=requestAnimationFrame(tick);
    }}
    onPointerMove={e=>{const start=gesture.current;if(!start)return;if(!(e.buttons&1)){finishBox();return;}start.clientX=e.clientX;start.clientY=e.clientY;updateBox();}}
    onPointerUp={()=>finishBox()} onPointerCancel={()=>finishBox(true)} onLostPointerCapture={()=>finishBox(true)} onKeyDown={e=>{if(e.key==="Escape" && gesture.current){e.preventDefault();e.stopPropagation();finishBox(true);}}}>
    <div ref={space} className="virtual-space" style={{height:virtual.getTotalSize()}}>{virtual.getVirtualItems().map(row=><div className="virtual-row" key={row.key} style={{transform:`translateY(${row.start}px)`,height:row.size,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
    {props.items.slice(row.index*columns,(row.index+1)*columns).map(item=><Asset key={item.id} item={item} backend={props.backend} list={props.list} size={props.size} selected={props.selected.includes(item.id)} disabled={props.disabled} bound={props.bound} select={keys=>props.select(item.id,keys)} inspect={()=>props.inspect(item.id)} open={()=>props.open(item.id)} drag={()=>props.drag(item.id)} tag={()=>props.tag(item)} remove={()=>props.remove(item.id)}/>)}
  </div>)}{box && <div className="selection-marquee" data-testid="selection-marquee" aria-hidden="true" style={box}/>}</div></div></SortableContext>;
}
export default function App({backend,native,detachedShelfId}:{backend:Backend;native:boolean;detachedShelfId?:number}) {
  const [data,setData]=useState<Snapshot>(blank),[shelfId,setShelfId]=useState(detachedShelfId??1);
  const [catalog,setCatalog]=useState<CatalogShelf[]>([]),[detachedIds,setDetachedIds]=useState<number[]>([]);
  const [selection,setSelection]=useState<{ids:number[];anchor:number|null;focus:number|null}>({ids:[],anchor:null,focus:null});
  const selected=selection.focus;
  function setSelected(id:number|null){setSelection({ids:id===null?[]:[id],anchor:id,focus:id});}
  const [searchOpen,setSearchOpen]=useState(false);
  const searchInput=useRef<HTMLInputElement>(null),searchButton=useRef<HTMLButtonElement>(null);
  const restoreSearchFocus=useRef(false);
  const [feedback,setFeedback]=useState(false);
  const [query,setQuery]=useState("");
  const [filters,setFilters]=useState<ShelfFilters>(defaultFilters),[filtersOpen,setFiltersOpen]=useState(false);
  const filtered=!!(filters.kind || filters.tag || filters.status);
  const [initialViews]=useState(readViewMemory);
  const [views,setViews]=useState(initialViews.views),[viewWarning,setViewWarning]=useState(initialViews.warning);
  const viewDirty=useRef<number|null>(null);
  const unsavedViews=useRef<Record<string,ShelfView>>({});
  const {list,sort,size}=views[String(shelfId)] || defaultView;
  const [theme,setTheme]=useState(readTheme),[themeWarning,setThemeWarning]=useState("");
  const preferenceWarning=[viewWarning,themeWarning].filter(Boolean).join("；");
  const [details,setDetails]=useState(false),[preview,setPreview]=useState(false),[width,setWidth]=useState(innerWidth),[detailPinned,setDetailPinned]=useState(false);
  const [topmost,setTopmost]=useState(false),[hover,setHover]=useState(false),[dragging,setDragging]=useState<number|null>(null);
  const [message,setMessage]=useState("正在恢复文件架…"),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<Progress|null>(null),[tasks,setTasks]=useState(false);
  const [creating,setCreating]=useState(false),[newName,setNewName]=useState(""),[sessionShelf,setSessionShelf]=useState(false),[formError,setFormError]=useState("");
  const [copyTo,setCopyTo]=useState(false),[copyTarget,setCopyTarget]=useState(0),[copyIds,setCopyIds]=useState<number[]>([]);
  const [recycleOpen,setRecycleOpen]=useState(false);
  const [systemRecycleIds,setSystemRecycleIds]=useState<number[]|null>(null);
  const [undo,setUndo]=useState<{entity:string;id:number;ids?:number[]}|null>(null);
  const [repairFeedback,setRepairFeedback]=useState<{error:boolean;message:string}|null>(null);
  const windowDrag=useWindowDrag(()=>backend.desktopMove(),!busy && !hover && !dragging);
  const activeShelf=useRef(shelfId); activeShelf.current=shelfId;
  const importRef=useRef<(paths:string[])=>void>(()=>{});
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const shelf=data.shelves.find(s=>s.id===shelfId),bound=shelf?.kind==="bound";
  const items=data.items.filter(item=>item.shelf_id===shelfId);
  const visible=useMemo(()=>sortItems(filterItems(data.items.filter(i=>i.shelf_id===shelfId),query,filters),sort),[data.items,shelfId,query,filters,sort]);
  const kinds=[...new Set([...items.map(i=>i.kind),filters.kind].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN"));
  const tags=[...new Set([...items.flatMap(i=>i.tags),filters.tag].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN"));
  const selectedIds=useMemo(()=>new Set(selection.ids),[selection.ids]);
  const chosen=useMemo(()=>visible.filter(i=>selectedIds.has(i.id)),[visible,selectedIds]);
  const current=chosen.find(i=>i.id===selected) || chosen[0],dragItem=data.items.find(i=>i.id===dragging);
  function select(id:number,keys:SelectionKeys={}){
    setSelection(previous=>{const visibleIds=visible.map(i=>i.id),visibleSet=new Set(visibleIds),ids=previous.ids.filter(id=>visibleSet.has(id)),add=keys.ctrlKey || keys.metaKey;
      if(keys.shiftKey && previous.anchor!==null && visibleIds.includes(previous.anchor)){const a=visibleIds.indexOf(previous.anchor),b=visibleIds.indexOf(id),range=visibleIds.slice(Math.min(a,b),Math.max(a,b)+1);return {ids:add?[...new Set([...ids,...range])]:range,anchor:previous.anchor,focus:id};}
      return {ids:add?ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]:[id],anchor:id,focus:id};});
  }
  function marquee(ids:number[]){setSelection({ids,anchor:ids[0]??null,focus:ids[ids.length-1]??null});}
  function drag(id:number){const targets=chosen.some(i=>i.id===id)?chosen:visible.filter(i=>i.id===id);if(!targets.length)return;if(!chosen.some(i=>i.id===id))setSelected(id);if(targets.length>64){setError("请选择 1 至 64 项拖出；不会只复制部分选中项。");return;}if(targets.some(i=>i.status!=="normal")){setError("选中项含失效或不可读引用，请取消选择后重试。");return;}if(native)void perform(()=>backend.drag(targets.map(i=>i.id)));}
  const running=data.jobs.find(j=>activeStatus(j.status));
  const inline=details && detailPinned && width>=1000;
  async function refresh() { const value=await backend.snapshot(); setData(value); return value; }
  function activateShelf(id:number) { if(detachedShelfId!==undefined && id!==detachedShelfId)return;activeShelf.current=id;setShelfId(id); setSelected(null); setQuery(""); setFilters(defaultFilters);setFiltersOpen(false);setSearchOpen(false); setDetails(false); setPreview(false); }
  function desktopChanged(value:DesktopView) { setCatalog(value.catalog??[]);setDetachedIds((value.layout.detached??[]).map(s=>s.shelf_id));setTopmost(detachedShelfId===undefined?(value.layout.main_topmost??false):(value.layout.detached?.find(s=>s.shelf_id===detachedShelfId)?.topmost??false));if(detachedShelfId===undefined && value.layout.active_shelf!==activeShelf.current)activateShelf(value.layout.active_shelf);if(value.warning)setError(value.warning); }
  async function switchShelf(id:number) { if(detachedShelfId!==undefined)return;await perform(async()=>{await backend.desktopSelect(id);activateShelf(id);}); }
  async function perform(action:()=>Promise<unknown>) { setError(""); try { await action(); } catch(e) { setError(String(e)); } }
  async function open(id:number) {
    setSelected(id);
    setError("");
    try {const opened=await backend.open(id);setMessage(opened?"已请求系统默认程序打开。":"已取消打开，文件引用保持不变。");}
    catch(e) {setError(String(e));setMessage("打开未完成，请检查错误提示。");}
  }
  async function receive(paths:string[]) {
    if(!paths.length) return;
    if(activeShelf.current<=0){setError("请先新建文件架，或将独立文件架合并回主窗口。");return;}
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
      activate:activateShelf,changed:()=>{void refresh().catch(e=>setError(String(e)));},error:setError,
      metadata:()=>{void backend.managementSnapshot().then(value=>{const tags=new Map(value.items.map(i=>[i.id,i.tags]));setData(old=>({...old,items:old.items.map(i=>tags.has(i.id)?{...i,tags:tags.get(i.id)!}:i)}));}).catch(e=>setError(String(e)));},
      desktop:desktopChanged,
    }).then(fn=>{if(live) cleanup=fn;else fn();}).catch(e=>setError(String(e)));
    void Promise.all([refresh(),backend.desktopState()]).then(([,desktop])=>{if(live) {desktopChanged(desktop);setMessage("文件架已恢复。");setLoading(false);}}).catch(e=>{if(live) {setError(String(e));setLoading(false);}});
    return ()=>{live=false;cleanup?.();};
  },[backend]);
  useEffect(()=>{ document.documentElement.className=theme;setThemeWarning(writeTheme(theme)); },[theme]);
  useEffect(()=>observeTheme(setTheme),[]);
  function setView(patch:Partial<ShelfView>) {
    if(shelfId<=0)return;
    viewDirty.current=shelfId;
    setViews(previous=>({...previous,[shelfId]:{...(previous[String(shelfId)] || defaultView),...patch}}));
  }
  useEffect(()=>{
    const id=viewDirty.current;if(id===null)return;
    viewDirty.current=null;const warning=writeShelfView(id,views[String(id)],initialViews.writable);
    if(warning)unsavedViews.current[id]=views[String(id)];else delete unsavedViews.current[id];
    setViewWarning(warning);
  },[views,initialViews.writable]);
  useEffect(()=>{const read=()=>{if(viewDirty.current===null){const next=readViewMemory();setViews({...next.views,...unsavedViews.current});if(!Object.keys(unsavedViews.current).length)setViewWarning(next.warning);}};const storage=(event:StorageEvent)=>{if(event.key===null || event.key==="ningmao-shelf-views")read();};window.addEventListener("storage",storage);window.addEventListener("focus",read);return()=>{window.removeEventListener("storage",storage);window.removeEventListener("focus",read);};},[]);
  useEffect(()=>{ const fn=()=>setWidth(innerWidth);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn); },[]);
  useEffect(()=>{
    if(!running) return;
    const timer=setInterval(()=>void refresh().catch(e=>setError(String(e))),1200);
    return()=>clearInterval(timer);
  },[running?.id,backend]);
  useEffect(()=>{
    const fn=(e:KeyboardEvent)=>{
      if(e.defaultPrevented || e.isComposing || (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable],.drag-handle,[role=dialog],[role=menu]"))) return;
      if(e.code==="Space" && current) {e.preventDefault();setPreview(true);}
      if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="a" && e.target instanceof HTMLElement && e.target.closest('.file-scroll')){e.preventDefault();marquee(visible.map(i=>i.id));}
      if(e.key==="Escape") {if(!preview && !details)setSelected(null);setPreview(false);setDetails(false);}
      if(e.key==="Delete" && chosen.length && !e.repeat && e.target instanceof HTMLElement && e.target.closest('.file-scroll')){e.preventDefault();void perform(async()=>{try{const ids=chosen.map(i=>i.id);if(backend.removeReferences)await backend.removeReferences(ids);else for(const id of ids)await backend.remove(id);setUndo({entity:"item",id:ids[0],ids});}finally{await refresh();}setSelected(null);setMessage("选中项已移入柠猫回收站，原文件保留。");});}
    };
    window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn);
  },[current,chosen,visible,bound,backend,preview,details]);
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
  async function remove(id:number) { await perform(async()=>{await backend.remove(id);setUndo({entity:"item",id});setSelected(null);setDetails(false);await refresh();setMessage("已移入柠猫回收站，原文件保留。");}); }
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
  const detail=chosen.length>1 && !preview?<div className="file-details"><h3>已选 {chosen.length} 项</h3><dl><dt>文件</dt><dd>{chosen.filter(i=>i.kind!=="folder").length} 项</dd><dt>文件夹</dt><dd>{chosen.filter(i=>i.kind==="folder").length} 项</dd><dt>已知文件大小</dt><dd>{sizes(chosen.filter(i=>i.kind!=="folder").reduce((sum,item)=>sum+item.bytes,0))}</dd><dt>异常引用</dt><dd>{chosen.filter(i=>i.status!=="normal").length} 项</dd></dl><p className="muted">汇总仅包含当前可见选中项；文件夹内容不递归统计</p></div>:current && <div className="file-details"><div className="detail-preview"><Thumb item={current} backend={backend} size={preview?220:160}/></div><h3>{current.name}</h3>
    <Badge variant="secondary">{states[current.status] || current.status}</Badge><dl><dt>原始路径</dt><dd>{current.path}</dd><dt>类型</dt><dd>{current.kind.toUpperCase()}</dd><dt>大小</dt><dd>{sizes(current.bytes)}</dd><dt>修改日期</dt><dd>{current.modified?new Date(current.modified*1000).toLocaleString():"不可用"}</dd><dt>标签</dt><dd>{current.tags.join("、") || "无"}</dd></dl>
    {current.status!=="normal" && <p>{bound?"记录与标签已保留。可恢复原路径、重新定位同目录项或清理引用；目录绑定不变。":"记录与标签已保留。恢复原路径后刷新，或手动重新定位；不会自动扫描磁盘。"}</p>}
    {["missing","unreadable"].includes(current.status) && <section className="reference-repair" aria-label="重新定位失效引用" aria-busy={busy}>
      <p>选择你确认的原文件或文件夹，再核对新位置。只修改引用，标签与顺序保留。</p>
      <div><Button variant="outline" disabled={!native || busy} onClick={()=>void relocate(current.id,false)}>{bound?"重新定位同目录文件":"重新定位文件"}</Button><Button variant="outline" disabled={!native || busy} onClick={()=>void relocate(current.id,true)}>{bound?"重新定位同目录文件夹":"重新定位文件夹"}</Button></div>
      {repairFeedback && <p role={repairFeedback.error?"alert":"status"}>{repairFeedback.message}</p>}
    </section>}
    <Button variant="outline" onClick={()=>void tag(current)}><Star size={14}/>切换精选标签</Button><p className="muted">图片预览按需加载 PNG / JPEG / WebP；其他类型保留图标。</p></div>;
  return <div className={`workstation ${hover?"drop-active":""}`}><ScrollActivity/>
    <SystemRecycle backend={backend} ids={systemRecycleIds} onClose={()=>setSystemRecycleIds(null)} onChanged={refresh}/>
    <RecycleDrawer backend={backend} open={recycleOpen} onOpenChange={setRecycleOpen} shelfId={shelfId} onChanged={refresh}/>
    {undo&&<div className="undo-record" role="status">已移入柠猫回收站 <Button variant="ghost" onClick={()=>void perform(async()=>{for(const id of undo.ids??[undo.id])await backend.restoreTrash?.(undo.entity,id);setUndo(null);await refresh();})}>撤销</Button></div>}
    <header className="shelf-header" {...windowDrag}>
      {!searchOpen && <OrbFace brand/>}
      {searchOpen ? <div className="shelf-search"><Search size={16}/><Input ref={searchInput} aria-label="搜索文件" placeholder="搜索当前文件架" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Escape" && !e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();closeSearch();}}}/><Button variant="ghost" size="icon" aria-label="关闭搜索" onClick={closeSearch}><X size={16}/></Button></div> : <>
        <ShelfMenu label="文件架" align="start" trigger={<Button className="shelf-switch" variant="ghost" aria-label="切换文件架"><span>{shelf?.name || "主窗口"}</span><ChevronDown size={14}/></Button>}>
          <DropdownMenu.RadioGroup value={String(shelfId)} onValueChange={id=>switchShelf(Number(id))}>{data.shelves.map(s=><div className="shelf-choice" key={s.id}><DropdownMenu.RadioItem disabled={detachedShelfId!==undefined} value={String(s.id)}>{s.kind==="bound"?<Folder size={16}/>:<Archive size={16}/>}<span>{s.name}</span><DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem><button className="shelf-recycle" aria-label={`回收文件架 ${s.name}`} disabled={busy||!!running||hover||!!dragging||!backend.trashShelf} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void perform(async()=>{await backend.trashShelf?.(s.id);setUndo({entity:"shelf",id:s.id});await refresh();setMessage("整个文件架已移入柠猫回收站，原文件保留。");});}}><Trash2 size={14}/></button></div>)}</DropdownMenu.RadioGroup>
          {detachedShelfId===undefined && <><DropdownMenu.Separator/>{catalog.filter(s=>detachedIds.includes(s.id)).map(s=><DropdownMenu.Item key={s.id} onSelect={()=>void perform(()=>backend.desktopOpen(s.id))}>打开独立窗口 · {s.name}</DropdownMenu.Item>)}<DropdownMenu.Item disabled={!native || busy} onSelect={()=>{setNewName("");setSessionShelf(false);setFormError("");setCreating(true);}}><Plus size={16}/>新建文件架</DropdownMenu.Item><DropdownMenu.Item disabled={!native || busy || !!running} onSelect={()=>void perform(async()=>{const id=await backend.chooseFolder();await refresh();if(id)await switchShelf(id);})}><FolderPlus size={16}/>绑定文件夹</DropdownMenu.Item></>}
        </ShelfMenu>

        <Button ref={searchButton} variant="ghost" size="icon" aria-label="搜索文件" title="搜索文件 Ctrl+F" onClick={()=>setSearchOpen(true)}><Search size={16}/></Button>
      </>}
      <Button className="add-files" variant="ghost" size="icon" disabled={!native || loading || !shelf || busy || !!running} aria-label={bound?"添加并复制":"添加引用"} title={bound?"添加并复制，保留来源":"添加引用，保留原文件"} onClick={()=>void perform(async()=>receive(await backend.chooseFiles()))}><Plus size={18}/></Button>
      <Button className="shelf-collapse" variant="ghost" size="icon" aria-label="收起到悬浮入口" title="收起当前文件架" disabled={!native || loading || !shelf || busy || !!dragging || hover} onClick={()=>void perform(()=>backend.desktopCollapse(shelfId))}><ArrowDownToLine size={16}/></Button>
      <ShelfMenu label="更多操作" trigger={<Button variant="ghost" size="icon" aria-label="更多操作" title="更多操作"><MoreHorizontal size={18}/></Button>}>
        <DropdownMenu.Item className="compact-command" onSelect={()=>setSearchOpen(true)}>搜索文件</DropdownMenu.Item>
        <DropdownMenu.Item className="compact-command" disabled={!native || !shelf || busy || !!running} onSelect={()=>void perform(async()=>receive(await backend.chooseFiles()))}>添加文件</DropdownMenu.Item>
        <DropdownMenu.Item disabled={!native || loading || !shelf || busy} onSelect={()=>void perform(()=>backend.desktopCollapse(shelfId))}>收起到悬浮入口</DropdownMenu.Item>
        <DropdownMenu.Item disabled={!native || loading || !shelf || busy} onSelect={()=>void perform(()=>detachedShelfId===undefined?backend.desktopDetach(shelfId):backend.desktopMerge(shelfId))}>{detachedShelfId===undefined?"拆分为独立窗口":"合并回主窗口"}</DropdownMenu.Item>
        {detachedShelfId===undefined && <DropdownMenu.Item disabled={!native} onSelect={()=>void perform(()=>backend.desktopDisable())}>关闭悬浮入口</DropdownMenu.Item>}
        <DropdownMenu.Item onSelect={()=>setRecycleOpen(true)}><Trash2 size={16}/>柠猫回收站</DropdownMenu.Item>
        <DropdownMenu.Item disabled={!native} onSelect={()=>void perform(()=>backend.managerOpen())}>管理中心</DropdownMenu.Item>
        <DropdownMenu.Item disabled={!native || !chosen.length || busy} onSelect={()=>{setCopyIds(chosen.map(i=>i.id));setCopyTarget(catalog.find(s=>s.id!==shelfId && s.kind!=="bound")?.id || 0);setFormError("");setCopyTo(true);}}>复制选中引用到其他架</DropdownMenu.Item><DropdownMenu.Separator/>
        <DropdownMenu.Item disabled={!backend.planSystemRecycle || !chosen.length || chosen.some(i=>i.status!=="normal") || busy || !!running} onSelect={()=>setSystemRecycleIds(chosen.map(i=>i.id))}>将选中真实文件移入 Windows 回收站…</DropdownMenu.Item><DropdownMenu.Separator/>
        <DropdownMenu.Label className="menu-label">显示与排序</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={list?"list":"grid"} onValueChange={v=>setView({list:v==="list"})}><DropdownMenu.RadioItem value="grid"><Grid2X2 size={16}/>网格视图<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem><DropdownMenu.RadioItem value="list"><List size={16}/>详细列表<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem></DropdownMenu.RadioGroup>
        <DropdownMenu.RadioGroup value={sort} onValueChange={v=>{if(isSortMode(v))setView({sort:v});}}>{sortOptions.map(option=><DropdownMenu.RadioItem key={option.value} value={option.value}>{option.label}<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
        <DropdownMenu.Item onSelect={()=>setFiltersOpen(true)}><Search size={16}/>筛选文件</DropdownMenu.Item>
        <DropdownMenu.Label className="menu-label">缩略图大小</DropdownMenu.Label><DropdownMenu.RadioGroup className="thumbnail-choices" aria-label="缩略图大小" value={String(size)} onValueChange={v=>setView({size:v==="60"?60:v==="120"?120:80})}>{[[60,"小"],[80,"中"],[120,"大"]].map(([v,label])=><DropdownMenu.RadioItem key={v} aria-label={label+"缩略图"} value={String(v)}>{label}<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
        <DropdownMenu.Separator/>
        <DropdownMenu.Item disabled={loading} onSelect={()=>void perform(async()=>{await refresh();setMessage("已刷新文件状态。");})}><RefreshCw size={16}/>刷新文件状态</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={()=>setTasks(true)}>复制任务</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={16}/>:<Moon size={16}/>}切换{theme==="dark"?"浅色":"深色"}主题</DropdownMenu.Item>
        <DropdownMenu.CheckboxItem disabled={!native} checked={topmost} onCheckedChange={()=>void perform(async()=>setTopmost(await backend.topmost()))}><Pin size={16}/>窗口置顶<DropdownMenu.ItemIndicator><Check size={14}/></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>
        <DropdownMenu.Separator/><DropdownMenu.Item disabled={!native} onSelect={()=>void perform(()=>backend.quit())}>完整退出</DropdownMenu.Item>
      </ShelfMenu>
      <WindowControls backend={backend} onError={setError}/>
    </header>
    <div className="shelf-context" data-dropping={hover}><span className="shelf-semantics" title={bound?(shelf?.available?shelf.root || "":"绑定目录离线或不可读，保留原记录"):shelf?.kind==="session"?"完整退出后只清空引用，原文件保留":"持久保存引用，原文件保留"}>{!shelf?"请选择或新建文件架":hover?(bound?"释放以复制 · 保留来源":"释放以添加引用 · 保留原文件"):bound?"复制到目录 · 保留来源":shelf?.kind==="session"?"本次中转 · 仅保存引用":"仅保存引用"}</span><div className="selection-actions">{chosen.length>1 && <span className="selection-count" aria-label="已选数量" role="status">{chosen.length} 项</span>}{filtered && <Button variant="ghost" size="sm" className="filter-clear" aria-label="清除筛选" title="已启用文件筛选，点击清除" onClick={()=>setFilters(defaultFilters)}>已筛选<X size={12}/></Button>}{current && <>{chosen.some(i=>i.status!=="normal")&&<><Button variant="ghost" size="icon" aria-label="清理选中引用" title="移入柠猫回收站，保留原文件" disabled={busy||!!running} onClick={()=>void perform(async()=>{const ids=chosen.map(i=>i.id);if(backend.removeReferences)await backend.removeReferences(ids);else for(const id of ids)await backend.remove(id);setUndo({entity:"item",id:ids[0],ids});setSelected(null);await refresh();})}><Trash2 size={14}/></Button>{chosen.length===1&&<Button variant="ghost" size="sm" onClick={()=>{setDetails(true);}}>更新引用</Button>}</>}<Button variant="ghost" size="sm" aria-label="详情" onClick={()=>setDetails(true)}><Info size={14}/>详情</Button><Button variant="ghost" size="sm" disabled={chosen.some(i=>i.status!=="normal")} title="按住左键拖到目标，默认复制选中项" onPointerDown={e=>{if(e.button===0)drag(current.id);}} onKeyDown={e=>{if(e.key==="Enter")setMessage("请用鼠标按住“拖出复制”并拖向目标窗口。");}}><ArrowDownToLine size={14}/>拖出复制</Button></>}</div></div>
    {bound && !shelf.available && <p className="offline-note" role="status">目录离线，记录已保留 · 恢复目录后刷新</p>}
    {preferenceWarning && <div className="error-bar" role="alert"><span>{preferenceWarning}</span><Button variant="ghost" size="icon" aria-label="关闭设置提示" onClick={()=>{setViewWarning("");setThemeWarning("");}}><X size={15}/></Button></div>}
    {error && <div className="error-bar" role="alert"><span>{error}</span><Button variant="ghost" size="icon" aria-label="关闭错误提示" onClick={()=>setError("")}><X size={15}/></Button></div>}
    <div className="explorer-and-details"><main className="explorer-pane">
      {loading?<div className="empty-state"><p>正在恢复本地文件架…</p></div>:<DndContext sensors={sensors} collisionDetection={collision} onDragStart={e=>setDragging(Number(e.active.id))} onDragCancel={()=>setDragging(null)} onDragEnd={event=>{
        setDragging(null); if(filtered || query || sort!=="manual" || !event.over || event.over.id===event.active.id) return;
        const ids=items.map(i=>i.id),from=ids.indexOf(Number(event.active.id)),to=ids.indexOf(Number(event.over.id));
        if(from<0 || to<0) return;
        void perform(async()=>{await backend.reorder(shelfId,arrayMove(ids,from,to));await refresh();setMessage("手动顺序已保存，磁盘文件保持不变。");});
      }}>
        {visible.length?<VirtualFiles items={visible} backend={backend} selected={chosen.map(i=>i.id)} list={list} size={size} disabled={sort!=="manual" || !!query || filtered} bound={!!bound} select={select} marquee={marquee} inspect={id=>{setSelected(id);setDetails(true);}} open={id=>void open(id)} drag={drag} tag={item=>void tag(item)} remove={id=>void remove(id)}/>:<div className="empty-state"><Folder size={32}/><h2>{!shelf?"主窗口暂无文件架":query || filtered?"没有匹配的文件":bound?"拖入文件，安全复制":"拖入文件，添加引用"}</h2><p>{!shelf?"可从左上菜单新建文件架，或将独立文件架合并回来":filtered?"更改筛选或搜索名称":query?"试试其他名称":bound?"重名自动编号，保留原文件":"保留原文件，或点击右上角添加"}</p>{!shelf&&<div className="empty-actions"><Button onClick={()=>{setNewName("");setFormError("");setCreating(true);}}>新建文件架</Button><Button variant="outline" onClick={()=>setRecycleOpen(true)}>从回收站恢复</Button></div>}{(query || filtered) && <Button variant="outline" onClick={()=>{setQuery("");setFilters(defaultFilters);}}>{filtered?query?"清除筛选和搜索":"清除筛选":"清除搜索"}</Button>}</div>}
        <DragOverlay>{dragItem && <div className="drag-preview" data-testid="drag-preview"><Thumb item={dragItem} backend={backend} size={45}/><span>{dragItem.name}</span><small>调整引用顺序</small></div>}</DragOverlay>
      </DndContext>}
    </main>{inline && current && <aside className="inspector"><header><h2>文件详情</h2><Button variant="ghost" size="icon" aria-label="关闭详情" onClick={()=>setDetails(false)}><X size={15}/></Button></header>{detail}</aside>}</div>
    {running && <button className="compact-progress" aria-label="查看复制任务" onClick={()=>setTasks(true)}><span>{progress?`复制中 · ${progress.file_index}/${progress.file_count}`:"复制中"}</span><progress aria-label="当前文件复制进度" value={progress?.bytes || 0} max={Math.max(1,progress?.total || 1)}/><span>查看</span></button>}
    <footer className={`file-status ${feedback && !running && !error && !preferenceWarning?"status-toast":"sr-only"}`} role="status">{message}</footer>
    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}><SheetContent className="details-sheet" showCloseButton={false}><SheetClose asChild><Button className="sheet-dismiss" variant="ghost" size="icon" aria-label="关闭筛选"><X size={16}/></Button></SheetClose><SheetHeader><SheetTitle>筛选文件</SheetTitle><SheetDescription>仅筛选当前架已有记录，不扫描磁盘</SheetDescription></SheetHeader><div className="filter-form">
      <label>文件类型<select value={filters.kind} onChange={e=>setFilters(previous=>({...previous,kind:e.target.value}))}><option value="">全部类型</option>{kinds.map(kind=><option key={kind} value={kind}>{kind==="folder"?"文件夹":kind==="file"?"无扩展名或未知":kind==="link"?"链接":kind.toUpperCase()}</option>)}</select></label>
      <label>标签<select value={filters.tag} onChange={e=>setFilters(previous=>({...previous,tag:e.target.value}))}><option value="">全部标签</option>{tags.map(tag=><option key={tag} value={tag}>{tag}</option>)}</select></label>
      <label>文件状态<select value={filters.status} onChange={e=>setFilters(previous=>({...previous,status:e.target.value==="normal"?"normal":e.target.value==="issues"?"issues":""}))}><option value="">全部状态</option><option value="normal">正常</option><option value="issues">异常引用</option></select></label>
      <Button variant="outline" disabled={!filtered} onClick={()=>setFilters(defaultFilters)}>重置筛选</Button><SheetClose asChild><Button>查看结果</Button></SheetClose>
    </div></SheetContent></Sheet>
    <Sheet open={tasks} onOpenChange={setTasks}><SheetContent className="details-sheet" showCloseButton={false}><SheetClose asChild><Button className="sheet-dismiss" variant="ghost" size="icon" aria-label="关闭复制任务"><X size={16}/></Button></SheetClose><SheetHeader><SheetTitle>复制任务</SheetTitle><SheetDescription>来源保留，失败与中断记录不会自动清理</SheetDescription></SheetHeader><div className="task-list">
      {progress && <div className="copy-progress"><span>{progress.name} · {progress.file_index}/{progress.file_count}</span><progress aria-label="复制任务进度" value={progress.bytes} max={Math.max(1,progress.total)}/><span>{sizes(progress.bytes)} / {sizes(progress.total)}</span></div>}
      {!data.jobs.length && <p className="muted">暂无复制任务</p>}
      {data.jobs.map(job=><div className="job" key={job.id}><Badge variant={["failed","interrupted","partial"].includes(job.status)?"destructive":"secondary"}>{jobStates[job.status] || job.status}</Badge><span>{job.message}</span>{activeStatus(job.status) && <Button variant="outline" onClick={()=>void perform(()=>backend.cancel(job.id))}>取消复制</Button>}{job.status==="interrupted" && job.staging && <p className="muted">上次临时文件位置：{job.staging}（未自动删除）</p>}</div>)}
    </div></SheetContent></Sheet>
    <Sheet open={(details && !inline || preview) && !!current} onOpenChange={value=>{if(!value){setDetails(false);setPreview(false);}}}><SheetContent className="details-sheet" showCloseButton={false}><SheetClose asChild><Button className="sheet-dismiss" variant="ghost" size="icon" aria-label="关闭详情"><X size={16}/></Button></SheetClose><SheetHeader><SheetTitle>{preview?"快速预览":"文件详情"}</SheetTitle><SheetDescription>真实本地文件信息；移除引用保留原文件。</SheetDescription></SheetHeader>{width>=1000 && !preview && <Button variant="ghost" onClick={()=>setDetailPinned(true)}>固定到右侧</Button>}{detail}</SheetContent></Sheet>
    <Sheet open={creating} onOpenChange={value=>{if(!busy)setCreating(value);}}><SheetContent className="details-sheet" showCloseButton={false}><SheetClose asChild><Button className="sheet-dismiss" variant="ghost" size="icon" disabled={busy} aria-label="关闭新建文件架"><X size={16}/></Button></SheetClose><SheetHeader><SheetTitle>新建文件架</SheetTitle><SheetDescription>保存文件引用，原文件始终留在原处</SheetDescription></SheetHeader><form className="filter-form" onSubmit={event=>{event.preventDefault();if(busy)return;setBusy(true);setFormError("");void (async()=>{try{const id=await backend.createShelf(newName,sessionShelf);await refresh();await backend.desktopSelect(id);activateShelf(id);setCreating(false);setMessage("文件架已创建。");}catch(e){setFormError(String(e));}finally{setBusy(false);}})();}}>
      <label>文件架名称<Input autoFocus maxLength={60} required value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter" && e.nativeEvent.isComposing)e.preventDefault();}}/></label>
      <label className="shelf-session"><input type="checkbox" checked={sessionShelf} onChange={e=>setSessionShelf(e.target.checked)}/>仅本次中转</label><p className="muted">{sessionShelf?"完整退出时清空引用和标签；原文件保留。":"持久保存，退出后可继续整理。"}</p>{formError && <p role="alert">{formError}</p>}<Button type="submit" disabled={busy || !newName.trim()}>{busy?"正在创建…":"创建"}</Button>
    </form></SheetContent></Sheet>
    <Sheet open={copyTo} onOpenChange={value=>{if(!busy)setCopyTo(value);}}><SheetContent className="details-sheet" showCloseButton={false}><SheetClose asChild><Button className="sheet-dismiss" variant="ghost" size="icon" disabled={busy} aria-label="关闭跨架复制"><X size={16}/></Button></SheetClose><SheetHeader><SheetTitle>复制引用到其他架</SheetTitle><SheetDescription>选中 {copyIds.length} 项 · 保留来源架、原文件和标签</SheetDescription></SheetHeader><form className="filter-form" onSubmit={event=>{event.preventDefault();if(busy || !copyTarget)return;setBusy(true);setFormError("");void backend.copyReferences(copyTarget,copyIds).then(async added=>{await refresh();setCopyTo(false);setMessage(`已添加 ${added} 项引用；目标已有项保持不变。`);}).catch(e=>setFormError(String(e))).finally(()=>setBusy(false));}}><label>目标文件架<select value={copyTarget} onChange={e=>setCopyTarget(Number(e.target.value))}><option value={0}>请选择</option>{catalog.filter(s=>s.id!==shelfId && s.kind!=="bound").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><p className="muted">绑定目录请用拖出复制；这里仅添加引用。</p>{formError && <p role="alert">{formError}</p>}<Button type="submit" disabled={busy || !copyTarget}>{busy?"正在复制…":"复制引用"}</Button></form></SheetContent></Sheet>
  </div>;
}
