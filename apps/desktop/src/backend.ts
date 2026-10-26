import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
export type Shelf = { id: number; name: string; kind: "persistent" | "session" | "bound"; root: string | null; available: boolean };
export type Item = { id: number; shelf_id: number; path: string; name: string; kind: string; bytes: number; modified: number; status: string; tags: string[] };
export type Job = { id: number; shelf_id: number; status: string; message: string; staging: string | null };
export type Snapshot = { shelves: Shelf[]; items: Item[]; jobs: Job[] };
export type Progress = { job_id: number; name: string; file_index: number; file_count: number; bytes: number; total: number };
export type ImportResult = { added: number; job_id: number | null; errors: string[] };
export type DesktopPreferences={edge:"free"|"left"|"right"|"top"|"bottom";auto_hide:boolean;topmost:boolean;flow?:"vertical"|"horizontal"};
export type EntryPresentation={kind:"orb"|"capsule"|"quick-peek";shelf_id:number|null};
export type EntrySlot={id:number;x:number;y:number;width:number;height:number};
export type PeekData={shelf:CatalogShelf;total:number;items:{id:number;name:string;kind:string;status:string;thumbnail:string|null}[]};
export type ManagedReference=Pick<Item,"id"|"shelf_id"|"path"|"name"|"tags">;
export type ManagementSnapshot={shelves:Pick<Shelf,"id"|"name"|"kind">[];items:ManagedReference[];jobs:Job[]};
export type CatalogShelf=Pick<Shelf,"id"|"name"|"kind">;
export type DesktopView = {layout:{enabled:boolean;expanded:boolean;active_shelf:number;collapsed:number[];page:number;preferences:DesktopPreferences;main_topmost?:boolean;detached?:{shelf_id:number;visible:boolean;topmost:boolean}[]};entries:{id:number;name:string;kind:string}[];total:number;warning:string|null;copying:boolean;edge_hidden:boolean;catalog?:CatalogShelf[];presentation?:EntryPresentation;geometry?:{width:number;height:number;slots:EntrySlot[]};native_dragging?:boolean;always_scrollbars?:boolean;close_lower?:boolean;drag_target?:number|null};
export function detachedShelfFromLabel(label:string):number|undefined {
  if(!/^shelf-[1-9]\d*$/.test(label))return undefined;
  const id=Number(label.slice(6));return Number.isSafeInteger(id)?id:undefined;
}
export type NearPointer={shelf_id:number|null;x:number;y:number};
export type Events = {near?:(value:NearPointer)=>void; drop: (paths: string[]) => void; hover: (active: boolean) => void; progress: (p: Progress) => void; finished: (message: string) => void; drag: (message: string) => void; activate?:(id:number)=>void; changed?:()=>void; metadata?:()=>void; desktop?:(view:DesktopView)=>void; error?:(message:string)=>void };
export type TrashEntry={id:number;entity:"item"|"shelf";name:string;shelf_id:number;shelf_name:string;shelf_kind:string;path:string|null;removed_at:number;children:number};
export type SystemRecyclePreview={ticket:string;items:{id:number;name:string;path:string;other_references:number;shelf_kind:string}[]};
export type SystemRecycleOutcome={id:number;status:string;message:string};
export type RecycleActivity={id:number;shelf_id:number;name:string;status:string;message:string};
export type WakeShortcutConfig={version:number;enabled:boolean;accelerator:string};
export type WakeShortcutState={config:WakeShortcutConfig;active:boolean;paused:boolean;warning:string|null};
export interface Backend {
  recoverWindows?:()=>Promise<number>;
  wakeShortcutState?:()=>Promise<WakeShortcutState>;
  wakeShortcutConfigure?:(config:WakeShortcutConfig)=>Promise<WakeShortcutState>;
  wakeShortcutPause?:(paused:boolean)=>Promise<WakeShortcutState>;
  windowAction?:(action:"minimize"|"toggle-maximize"|"hide")=>Promise<boolean>;
  windowState?:()=>Promise<boolean>;
  subscribeWindowState?:(callback:(maximized:boolean)=>void)=>Promise<()=>void>;
  recycleActivity?:()=>Promise<RecycleActivity[]>;
  removeReferences?:(ids:number[])=>Promise<void>;
  planSystemRecycle?:(ids:number[])=>Promise<SystemRecyclePreview>;
  executeSystemRecycle?:(ticket:string)=>Promise<SystemRecycleOutcome[]>;
  cancelSystemRecycle?:()=>Promise<void>;
  trashEntries?:(filter:number|null)=>Promise<TrashEntry[]>;
  trashShelf?:(id:number)=>Promise<void>;
  restoreTrash?:(entity:string,id:number)=>Promise<void>;
  purgeTrash?:(entity:string,id:number)=>Promise<boolean>;
  snapshot(): Promise<Snapshot>;
  chooseFiles(): Promise<string[]>;
  chooseFolder(): Promise<number | null>;
  importPaths(shelf: number, paths: string[]): Promise<ImportResult>;
  remove(id: number): Promise<void>;
  relocate(id: number, directory: boolean): Promise<boolean>;
  tags(id: number, tags: string[]): Promise<void>;
  reorder(shelf: number, ids: number[]): Promise<void>;
  thumbnail(id: number): Promise<string | null>;
  drag(ids: number[]): Promise<void>;
  open(id: number): Promise<boolean>;
  reveal(id: number): Promise<void>;
  cancel(id: number): Promise<void>;
  topmost(): Promise<boolean>;
  quit(): Promise<void>;
  createShelf(name:string,session:boolean):Promise<number>;
  copyReferences(target:number,ids:number[]):Promise<number>;
  desktopState():Promise<DesktopView>;
  desktopPresent(shelf:number,kind:EntryPresentation["kind"]):Promise<void>;
  desktopPeek(shelf:number):Promise<PeekData>;
  desktopCollapse(id:number):Promise<void>;
  desktopOpen(id:number):Promise<void>;
  desktopSelect(id:number):Promise<void>;
  desktopPage(delta:number):Promise<void>;
  desktopMove():Promise<void>;
  desktopContour?:(amount:number,lower:boolean)=>Promise<void>;
  desktopSense?:(enabled:boolean)=>Promise<void>;
  desktopDisable():Promise<void>;
  managerOpen():Promise<void>;
  managementSnapshot():Promise<ManagementSnapshot>;
  tagReferences(ids:number[],tag:string,remove:boolean):Promise<number>;
  desktopConfigure(preferences:DesktopPreferences):Promise<boolean>;
  desktopHover(inside:boolean):Promise<void>;
  desktopDetach(id:number):Promise<void>;
  desktopMerge(id:number):Promise<void>;
  subscribe(events: Events): Promise<() => void>;
}
export const nativeBackend: Backend = {
  recoverWindows:()=>invoke("recover_desktop_windows"),
  wakeShortcutState:()=>invoke("wake_shortcut_state"),wakeShortcutConfigure:config=>invoke("wake_shortcut_configure",{config}),wakeShortcutPause:paused=>invoke("wake_shortcut_pause",{paused}),
  windowAction:action=>invoke("file_window_action",{action}),windowState:()=>invoke("file_window_state"),
  subscribeWindowState:callback=>getCurrentWebviewWindow().listen<boolean>("file-window-state",e=>callback(e.payload)),
  recycleActivity:()=>invoke("recycle_activity"),removeReferences:ids=>invoke("remove_references",{ids}),
  planSystemRecycle:ids=>invoke("plan_system_recycle",{ids}),executeSystemRecycle:ticket=>invoke("execute_system_recycle",{ticket}),cancelSystemRecycle:()=>invoke("cancel_system_recycle"),
  trashEntries:filter=>invoke("trash_entries",{filter}),trashShelf:shelfId=>invoke("trash_shelf",{shelfId}),
  restoreTrash:(entity,id)=>invoke("restore_trash",{entity,id}),purgeTrash:(entity,id)=>invoke("purge_trash",{entity,id}),
  snapshot: () => isTauri() ? invoke("snapshot") : Promise.reject("请启动 Windows 应用；浏览器预览不能读取本地文件。"),
  chooseFiles: () => invoke("choose_files"), chooseFolder: () => invoke("choose_folder"),
  importPaths: (shelfId, paths) => invoke("import_paths", { shelfId, paths }),
  remove: id => invoke("remove_reference", { id }), tags: (id,tags) => invoke("set_tags", { id,tags }),
  relocate: (id,directory) => invoke("relocate_reference", { id,directory }),
  reorder: (shelfId,ids) => invoke("reorder", { shelfId,ids }), thumbnail: id => invoke("thumbnail", { id }),
  drag: ids => invoke("start_native_drag", { ids }), reveal: id => invoke("reveal_item", { id }),
  open: id => invoke("open_item", { id }),
  cancel: jobId => invoke("cancel_copy", { jobId }), topmost: () => invoke("toggle_topmost"), quit: () => invoke("quit"),
  createShelf:(name,session)=>invoke("create_shelf",{name,session}),
  copyReferences:(target,ids)=>invoke("copy_references",{target,ids}),
  desktopPresent:(shelfId,kind)=>invoke("desktop_present",{shelfId,kind}),desktopPeek:shelfId=>invoke("desktop_peek",{shelfId}),
  desktopState:()=>invoke<DesktopView>("desktop_state").then(view=>{document.documentElement.dataset.alwaysScrollbars=String(view.always_scrollbars??false);return view;}),desktopCollapse:shelfId=>invoke("desktop_collapse",{shelfId}),desktopOpen:shelfId=>invoke("desktop_open",{shelfId}),
  desktopSelect:shelfId=>invoke("desktop_select",{shelfId}),desktopPage:delta=>invoke("desktop_page",{delta}),desktopMove:()=>invoke("desktop_move"),desktopContour:(amount,lower)=>invoke("desktop_contour",{amount,lower}),desktopSense:enabled=>invoke("desktop_sense",{enabled}),desktopDisable:()=>invoke("desktop_disable"),
  managerOpen:()=>invoke("manager_open"),managementSnapshot:()=>invoke("management_snapshot"),
  tagReferences:(ids,tag,remove)=>invoke("tag_references",{ids,tag,remove}),
  desktopConfigure:preferences=>invoke("desktop_configure",{preferences}),desktopHover:inside=>invoke("desktop_hover",{inside}),
  desktopDetach:shelfId=>invoke("desktop_detach",{shelfId}),desktopMerge:shelfId=>invoke("desktop_merge",{shelfId}),
  async subscribe(events) {
    if (!isTauri()) return () => {};
    const cleanups: (() => void)[] = [];
    try {
      if(getCurrentWebviewWindow().label==="main" || detachedShelfFromLabel(getCurrentWebviewWindow().label)!==undefined)cleanups.push(await getCurrentWebviewWindow().onDragDropEvent(event => {
        const payload=event.payload;
        events.hover(payload.type === "enter" || payload.type === "over");
        if (payload.type === "drop") events.drop(payload.paths);
      }));
      cleanups.push(await getCurrentWebviewWindow().listen<boolean>("window-moving",event=>{document.documentElement.dataset.windowMoving=String(event.payload);window.dispatchEvent(new CustomEvent("ningmao-window-motion",{detail:event.payload}));}));
      cleanups.push(await listen<NearPointer>("desktop-near-pointer",event=>events.near?.(event.payload)));
      cleanups.push(await listen<Progress>("copy-progress", event => events.progress(event.payload)));
      cleanups.push(await listen<{message:string}>("copy-finished", event => events.finished(event.payload.message)));
      cleanups.push(await listen<string>("native-drag-result", event => events.drag(event.payload)));
      cleanups.push(await listen<number>("desktop-activate-shelf",event=>events.activate?.(event.payload)));
      cleanups.push(await listen<DesktopView>("desktop-updated",event=>{document.documentElement.dataset.alwaysScrollbars=String(event.payload.always_scrollbars??false);events.desktop?.(event.payload);}));
      cleanups.push(await listen<string>("desktop-error",event=>events.error?.(event.payload)));
      cleanups.push(await listen<string>("desktop-imported",event=>events.finished(event.payload)));
      cleanups.push(await listen("workstation-changed",()=>events.changed?.()));
      cleanups.push(await listen("reference-tags-changed",()=>events.metadata?.()));
      return () => cleanups.forEach(fn => fn());
    } catch (error) { cleanups.forEach(fn => fn()); throw error; }
  },
};
