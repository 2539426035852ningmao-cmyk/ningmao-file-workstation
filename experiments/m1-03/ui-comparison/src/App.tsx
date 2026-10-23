import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Archive, ArrowDownToLine, Check, ChevronDown, ChevronRight, File, Folder, GripVertical, Grid2X2, Info, List, Moon, PanelLeftClose, PanelLeftOpen, Pin, Search as SearchIcon, Star, Sun, Tag, X } from "lucide-react";
import { Badge, Button, Drawer, Menu, Search, ShelfTabs, type Variant } from "./ui";
import { GridItem } from "./components/spaceui/GridItem";
import { FileThumb } from "./components/spaceui/FileThumb";
import { TagPill } from "./components/spaceui/TagPill";
import { createAssets, filterAssets, reorder, sizeLabel, type Asset } from "./model";

const params = new URLSearchParams(location.search);
const native = isTauri();
const collision: CollisionDetection = args => {
  const underPointer = pointerWithin(args);
  return underPointer.length ? underPointer : closestCenter(args);
};
const iconSrc = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M20 8h27l15 15v49H20Z" fill="#7896b0"/><path d="M47 8v17h15" fill="#d5e3ef"/><path d="M29 39h24M29 48h24M29 57h15" stroke="#fff" stroke-width="3"/></svg>')}`;
function record(kind: string, detail: unknown) {
  if (native) void invoke("record_event", { kind: `m103-${kind}`, detail: JSON.stringify(detail) }).catch(console.error);
}
function Thumb({ file, system, size }: { file: Asset; system: Variant; size: number }) {
  const src = file.unavailable ? null : file.thumb;
  return system === "spaceui" ? <FileThumb iconSrc={iconSrc} thumbnailSrc={src} size={size} /> : <img src={src || iconSrc} alt="" width={size} height={size} className="thumb-image" />;
}
function SortableAsset({ file, system, list, size, selected, disabled, select, inspect, tag, remove }: { file: Asset; system: Variant; list: boolean; size: number; selected: boolean; disabled: boolean; select: () => void; inspect: () => void; tag: () => void; remove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: file.id, disabled });
  const item = <div ref={setNodeRef} className={`asset ${list ? "asset-row" : "asset-grid"} ${selected ? "selected" : ""} ${isDragging ? "dragging" : ""}`} data-asset-id={file.id} style={{ transform: CSS.Transform.toString(transform), transition }} onContextMenu={select}>
    <button ref={setActivatorNodeRef} className="drag-handle" aria-label={`拖动 ${file.name}`} disabled={disabled} {...attributes} {...listeners}><GripVertical size={15} /></button>
    {!list && system === "spaceui" ? <GridItem name={file.name} sizeText={sizeLabel(file.bytes)} thumbSize={size} selected={selected} tags={file.tags.map(name => ({ name, color: "#4387ce" }))} thumb={{ iconSrc, thumbnailSrc: file.unavailable ? null : file.thumb }} onClick={select} onDoubleClick={inspect} className="space-grid-item" /> : <button className="asset-select" aria-pressed={selected} onClick={select} onDoubleClick={inspect}><Thumb file={file} system={system} size={list ? 34 : size} /><span className="asset-name" title={file.name}>{file.name}</span>{list ? <><span className="file-kind">{file.type.toUpperCase()}</span><span>{sizeLabel(file.bytes)}</span><span className="file-date">{file.date}</span></> : <span className="asset-meta">{sizeLabel(file.bytes)}<span className="tag-dot" title={file.tags.join("、")} /></span>}</button>}
    {file.unavailable && <span className="unavailable">预览不可用</span>}
  </div>;
  return <Menu system={system} inspect={inspect} tag={tag} remove={remove}>{item}</Menu>;
}

function VirtualFiles({ files, system, view, size, selected, sort, scroll, select, inspect, tag, remove }: { files: Asset[]; system: Variant; view: string; size: number; selected: string | null; sort: string; scroll: RefObject<HTMLDivElement | null>; select: (id: string) => void; inspect: (id: string) => void; tag: (id: string) => void; remove: (id: string) => void }) {
  const [width, setWidth] = useState(700);
  const columns = view === "list" ? 1 : Math.max(1, Math.floor(width / (size + 82)));
  const rowHeight = view === "list" ? 54 : size + 100;
  const ids = useMemo(() => files.map(file => file.id), [files]);
  const virtual = useVirtualizer({ count: Math.ceil(files.length / columns), getScrollElement: () => scroll.current, estimateSize: () => rowHeight, overscan: 2, useFlushSync: false });
  useEffect(() => {
    const element = scroll.current; if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element); return () => observer.disconnect();
  }, [scroll]);
  useEffect(() => { virtual.measure(); }, [rowHeight, columns, virtual]);
  return <SortableContext items={ids} strategy={rectSortingStrategy}><div className="file-scroll" ref={scroll} data-testid="file-scroll" aria-label="素材内容" tabIndex={0}><div className="virtual-space" style={{ height: virtual.getTotalSize() }}>{virtual.getVirtualItems().map(row => <div key={row.key} className="virtual-row" style={{ transform: `translateY(${row.start}px)`, height: row.size, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{files.slice(row.index * columns, (row.index + 1) * columns).map(file => <SortableAsset key={file.id} file={file} system={system} list={view === "list"} size={size} selected={selected === file.id} disabled={sort !== "manual"} select={() => select(file.id)} inspect={() => inspect(file.id)} tag={() => tag(file.id)} remove={() => remove(file.id)} />)}</div>)}</div></div></SortableContext>;
}

export default function App() {
  const [system, setSystem] = useState<Variant>(params.get("variant") === "shadcn" ? "shadcn" : "spaceui");
  const [theme, setTheme] = useState(params.get("theme") === "light" ? "light" : "dark");
  const [count, setCount] = useState(params.get("count") === "2000" ? 2000 : 500);
  const [files, setFiles] = useState(() => createAssets(count));
  const [order, setOrder] = useState(() => files.map(file => file.id));
  const [view, setView] = useState(params.get("view") === "list" ? "list" : "grid");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState("manual");
  const [size, setSize] = useState(84);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [sidebar, setSidebar] = useState(innerWidth > 820);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [width, setWidth] = useState(innerWidth);
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState("合成素材已就绪");
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const [nativeDrop, setNativeDrop] = useState(0);
  const [sortCount, setSortCount] = useState(0);
  const [fixtures, setFixtures] = useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const byId = useMemo(() => new Map(files.map(file => [file.id, file])), [files]);
  const visible = useMemo(() => {
    const ordered = order.map(id => byId.get(id)).filter((file): file is Asset => Boolean(file));
    const filtered = filterAssets(ordered, query, group, tag);
    return sort === "name" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")) : filtered;
  }, [order, byId, query, group, tag, sort]);
  const selectedFile = selected ? byId.get(selected) : undefined;
  const draggingFile = active ? byId.get(active) : undefined;
  const inlineDetails = details && pinned && width >= 1000;

  useEffect(() => { document.documentElement.className = `${system} ${theme}`; }, [system, theme]);
  useEffect(() => {
    const listener = () => { setWidth(innerWidth); if (innerWidth <= 820) setSidebar(false); };
    window.addEventListener("resize", listener); return () => window.removeEventListener("resize", listener);
  }, []);
  useEffect(() => {
    if (!native) return;
    void invoke<string[]>("fixture_list").then(setFixtures).catch(console.error);
    const unlisten = getCurrentWebviewWindow().onDragDropEvent(event => {
      if (event.payload.type === "drop") {
        const names = event.payload.paths.map(path => path.split(/[\\/]/).pop());
        setNativeDrop(value => value + 1); setStatus(`原生接收：${names.join("、")}（仅记录事件）`);
        record("native-drop", { system, names });
      }
    });
    return () => { void unlisten.then(fn => fn()); };
  }, [system]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable],.drag-handle"))) return;
      if (event.code === "Space" && selected) { event.preventDefault(); setPreview(true); }
      if (event.key === "Escape") { setDetails(false); setPreview(false); }
    };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, [selected]);

  function reset(next: number) {
    const assets = createAssets(next); setCount(next); setFiles(assets); setOrder(assets.map(file => file.id)); setSelected(null); setQuery(""); setGroup("all"); setTag("all"); setMetrics(null); setStatus(`已切换为 ${next} 项合成素材`); if (scroll.current) scroll.current.scrollTop = 0;
  }
  function inspect(id: string) { setSelected(id); setDetails(true); }
  function toggleTag(id: string) {
    setFiles(current => current.map(file => file.id !== id ? file : { ...file, tags: file.tags.includes("精选") ? file.tags.filter(value => value !== "精选") : [...file.tags, "精选"] })); setStatus("已更新样本标签");
  }
  function remove(id: string) {
    setFiles(current => current.filter(file => file.id !== id)); setOrder(current => current.filter(value => value !== id)); setSelected(null); setDetails(false); setStatus("已移除样本引用；未操作磁盘文件");
  }
  function endDrag(event: DragEndEvent) {
    setActive(null);
    if (!event.over || event.over.id === event.active.id) return;
    setOrder(ids => reorder(ids, String(event.active.id), String(event.over!.id))); setSortCount(value => value + 1);
    setStatus("手动顺序已更新，磁盘文件保持不变"); record("reorder", { system, active: event.active.id, over: event.over.id });
  }
  async function benchmark() {
    if (!scroll.current || benchmarking) return;
    setBenchmarking(true); setStatus("正在运行可复现滚动采样…");
    const element = scroll.current, frames: number[] = []; let last = performance.now(), maxMounted = 0;
    const started = performance.now();
    for (let i = 0; i < 90; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(now => {
        frames.push(now - last); last = now;
        element.scrollTop = (element.scrollHeight - element.clientHeight) * (i < 45 ? i / 44 : (89 - i) / 44);
        maxMounted = Math.max(maxMounted, document.querySelectorAll("[data-asset-id]").length); resolve();
      }));
    }
    const sorted = frames.slice(2).sort((a, b) => a - b);
    const report = { system, theme, count: visible.length, view, viewport: `${innerWidth}x${innerHeight}`, samples: sorted.length, p95FrameMs: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)), maxMounted, durationMs: Number((performance.now() - started).toFixed(1)), native, method: "90 RAF programmatic scroll; not a human-input latency or release benchmark" };
    setMetrics(report); record("perf", report); setBenchmarking(false); setStatus("滚动采样完成，测试设置中可查看记录");
  }
  const iconButton = (label: string, child: ReactNode, onClick: () => void, pressed?: boolean) => <Button system={system} className="icon-button" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}>{child}</Button>;
  const fileDetails = selectedFile && <div className="file-details"><div className="detail-preview"><Thumb file={selectedFile} system={system} size={190} /></div><h3>{selectedFile.name}</h3>{selectedFile.unavailable && <p className="error-note">预览不可用。样本状态保留，可继续查看分类。</p>}<dl><dt>文件类型</dt><dd>{selectedFile.type.toUpperCase()}</dd><dt>大小</dt><dd>{sizeLabel(selectedFile.bytes)}</dd><dt>修改日期</dt><dd>{selectedFile.date}</dd><dt>虚拟分组</dt><dd>{selectedFile.group}</dd><dt>来源</dt><dd>本地生成的合成素材</dd></dl><h4>标签</h4><div className="tags">{selectedFile.tags.map(value => system === "spaceui" ? <TagPill key={value} color={theme === "dark" ? "#95bffa" : "#245f99"}>{value}</TagPill> : <Badge key={value} system={system}>{value}</Badge>)}</div><Button system={system} onClick={() => toggleTag(selectedFile.id)}><Star size={15} />切换精选标签</Button></div>;

  return <div className="workstation" data-system={system} data-sidebar={sidebar}>
    <header className="appbar"><div className="brand"><Archive size={21} /><strong>柠猫文件工作站</strong><span>M1-03 原型比较</span></div><div className="appbar-actions"><label className="sr-only" htmlFor="system">比较方案</label><select id="system" value={system} onChange={event => setSystem(event.target.value as Variant)}><option value="spaceui">A · SpaceUI</option><option value="shadcn">B · shadcn/ui</option></select>{native && <Button system={system} onClick={() => void invoke("show_html_probe")}>打开 B 对照窗</Button>}{iconButton(theme === "dark" ? "切换浅色主题" : "切换深色主题", theme === "dark" ? <Sun size={17} /> : <Moon size={17} />, () => setTheme(theme === "dark" ? "light" : "dark"))}</div></header>
    <div className="workspace-body">
      <aside className="sidebar"><div className="sidebar-heading">工作区</div><button className={group === "all" ? "nav-item active" : "nav-item"} onClick={() => setGroup("all")}><Archive size={17} /><span>全部素材</span><small>{files.length}</small></button><button className="group-heading" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(!groupsOpen)}>{groupsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}虚拟分组</button>{groupsOpen && ["待整理", "设计参考", "项目交付"].map(value => <button key={value} className={group === value ? "nav-item active" : "nav-item"} onClick={() => setGroup(value)}><Folder size={16} /><span>{value}</span><small>{files.filter(file => file.group === value).length}</small></button>)}<div className="sidebar-heading tag-heading">标签</div>{["精选", "蓝色", "待核对"].map(value => <button key={value} className={tag === value ? "nav-item active" : "nav-item"} aria-pressed={tag === value} onClick={() => setTag(tag === value ? "all" : value)}><Tag size={15} /><span>{value}</span>{tag === value && <Check size={14} />}</button>)}<div className="sidebar-bottom"><span className="sample-dot" />合成素材 · 不读写真实文件<p>临时文件架的交互样本</p></div></aside>
      <main className="main-area"><div className="shelf-bar">{iconButton(sidebar ? "收起导航" : "展开导航", sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />, () => setSidebar(!sidebar))}<ShelfTabs system={system} value={group === "待整理" ? "all" : group} onChange={setGroup} /></div>
        <section className="content-heading"><div><h1>{group === "all" ? "灵感收集" : group}</h1><p>{visible.length} 项素材<span>临时引用</span>{tag !== "all" && <button className="filter-chip" onClick={() => setTag("all")}>{tag}<X size={12} /></button>}</p></div><label className="search-box"><SearchIcon size={16} /><Search system={system} aria-label="搜索素材" placeholder="搜索素材名称…" value={query} onChange={event => setQuery(event.target.value)} /></label></section>
        <div className="toolbar"><div className="view-controls">{iconButton("网格视图", <Grid2X2 size={16} />, () => setView("grid"), view === "grid")}{iconButton("详细列表", <List size={17} />, () => setView("list"), view === "list")}<span className="toolbar-divider" /><label>排序<select aria-label="排序方式" value={sort} onChange={event => setSort(event.target.value)}><option value="manual">手动顺序</option><option value="name">名称</option></select></label>{view === "grid" && <label className="size-control">缩略图<input aria-label="缩略图大小" type="range" min="60" max="120" step="12" value={size} onChange={event => setSize(Number(event.target.value))} /></label>}</div><div className="selection-actions">{selectedFile ? <><span>已选 1 项</span><Button system={system} onClick={() => setDetails(true)}><Info size={15} />详情</Button><Button system={system} onClick={() => setPreview(true)}>预览</Button></> : <span className="selection-hint">选择素材后显示操作</span>}</div></div>
        <div className="explorer-and-details"><div className="explorer-pane">{view === "list" && <div className="list-heading"><span>名称</span><span>类型</span><span>大小</span><span>修改日期</span></div>}
          <DndContext sensors={sensors} collisionDetection={collision} onDragStart={event => { setActive(String(event.active.id)); record("drag-start", { system, id: event.active.id }); }} onDragEnd={endDrag} onDragCancel={() => setActive(null)}>{visible.length ? <VirtualFiles files={visible} system={system} view={view} size={size} selected={selected} sort={sort} scroll={scroll} select={setSelected} inspect={inspect} tag={toggleTag} remove={remove} /> : <div className="empty-state"><SearchIcon size={28} /><h2>没有匹配的素材</h2><p>调整搜索词，或清除当前分组与标签筛选。</p><Button system={system} onClick={() => { setQuery(""); setGroup("all"); setTag("all"); }}>清除筛选</Button></div>}<DragOverlay>{draggingFile && <div className="drag-preview" data-testid="drag-preview"><Thumb file={draggingFile} system={system} size={48} /><span>{draggingFile.name}</span><small>调整引用顺序</small></div>}</DragOverlay></DndContext>
          <footer className="file-status" role="status"><span>{status}</span><span data-testid="interaction-counts">接收 {nativeDrop} · 排序 {sortCount}</span></footer>
        </div>{inlineDetails && selectedFile && <aside className="inspector"><header><h2>文件详情</h2>{iconButton("取消固定详情", <Pin size={15} />, () => setPinned(false))}{iconButton("关闭详情", <X size={17} />, () => setDetails(false))}</header>{fileDetails}</aside>}</div>
      </main>
    </div>
    <details className="test-settings"><summary>M1-03 测试设置 <span>{count} 项 · {native ? "Windows 原生接收开启" : "浏览器样机"}</span></summary><div className="test-panel"><label>样本数量<select aria-label="样本数量" value={count} onChange={event => reset(Number(event.target.value))}><option value="500">500 项</option><option value="2000">2000 项</option></select></label><Button system={system} onClick={() => reset(count)}>重置样本</Button><Button system={system} disabled={benchmarking} onClick={() => void benchmark()}>{benchmarking ? "正在采样…" : "运行滚动采样"}</Button>{native && <><Button system={system} onClick={() => void invoke("open_probe_folder", { kind: "source" })}><Folder size={15} />合成文件目录</Button>{fixtures.map((name, index) => <Button key={name} system={system} onPointerDown={event => { if (event.button === 0) void invoke("start_native_drag", { index }); }}><ArrowDownToLine size={15} />拖出 {name}</Button>)}</>}<output data-testid="metrics">{metrics ? JSON.stringify(metrics) : "尚未采样"}</output><p>内存样本用于比较 UI。原生接收只记录路径事件，不建立正式文件引用。滚动采样为程序驱动的 RAF 测量。</p></div></details>
    <Drawer system={system} title="文件详情" open={details && !inlineDetails && Boolean(selectedFile)} onClose={() => setDetails(false)}>{width >= 1000 && <Button system={system} onClick={() => setPinned(true)}><Pin size={15} />固定到右侧</Button>}{fileDetails}</Drawer>
    <Drawer system={system} title="快速预览" open={preview && Boolean(selectedFile)} onClose={() => setPreview(false)}>{fileDetails}</Drawer>
    <output className="sr-only" data-testid="first-order">{order.slice(0, 8).join(",")}</output>
    <span className="sr-only"><File />M1-03 两套组件实验</span>
  </div>;
}
