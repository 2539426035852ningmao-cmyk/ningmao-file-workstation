// This harness is a separate test-only build entry. Production dist contains no mock backend.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import DesktopEntry from "../src/DesktopEntry";
import Manager from "../src/Manager";
import type { Backend, DesktopView, Events, Item, Progress, Snapshot, TrashEntry } from "../src/backend";
import "../src/style.css";
const item=(id:number,name:string,shelf_id=1):Item=>({id,name,shelf_id,path:"SYNTHETIC/"+name,kind:"txt",bytes:200,modified:1,status:"normal",tags:[]});
const initial:Snapshot={shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},{id:2,name:"本次中转",kind:"session",root:null,available:true}],items:[item(1,"Alpha.txt"),item(2,"中文 文件.txt"),item(3,"Gamma.txt")],jobs:[]};
let wakeConfig=JSON.parse(localStorage.getItem("test-wake-shortcut")||'{"version":1,"enabled":true,"accelerator":"Ctrl+Alt+Space"}'),wakePaused=false,wakeAvailable=true;
let state:Snapshot=JSON.parse(localStorage.getItem("test-state") || JSON.stringify(initial));
const ownShelf=Number(new URLSearchParams(location.search).get("shelf")) || undefined;
let events:Events;let fail="";let snapshotFailure="";let next=10;let cancelRelocation=false;let cancelOpening=false;const calls:string[]=[];
const save=()=>localStorage.setItem("test-state",JSON.stringify(state));
let desktop:DesktopView=JSON.parse(localStorage.getItem("test-desktop-layout") || "null")??{layout:{enabled:false,expanded:true,active_shelf:1,collapsed:[],detached:[],page:0,preferences:{edge:"free",auto_hide:false,topmost:true}},entries:[],total:0,warning:null,copying:false,edge_hidden:false};
function publishDesktop(){desktop.entries=desktop.layout.collapsed.slice(desktop.layout.page*5,desktop.layout.page*5+5).map(id=>state.shelves.find(s=>s.id===id)!);desktop.total=desktop.layout.collapsed.length;desktop.catalog=state.shelves.map(({id,name,kind})=>({id,name,kind}));if(!desktop.entries.some(s=>s.id===desktop.presentation?.shelf_id))desktop.presentation={kind:"orb",shelf_id:null};let x=8,y=desktop.presentation?.kind==="capsule"?24:8,width=64,height=64;const horizontal=["top","bottom"].includes(desktop.layout.preferences.edge) || desktop.layout.preferences.edge==="free" && desktop.layout.preferences.flow==="horizontal";const slots=desktop.entries.filter(s=>desktop.presentation?.kind==="orb" || s.id===desktop.presentation?.shelf_id).map(s=>{const mode=s.id===desktop.presentation?.shelf_id?desktop.presentation.kind:"orb",w=mode==="quick-peek"?300:mode==="capsule"?184:48,h=mode==="quick-peek"?224:48,slot={id:s.id,x,y,width:w,height:h};width=Math.max(width,x+w+8);height=Math.max(height,y+h+(mode==="capsule"?24:8));if(horizontal)x+=w+8;else y+=h+8;return slot;});desktop.geometry={width,height:height+(desktop.total>5?24:0),slots};localStorage.setItem("test-desktop-layout",JSON.stringify(desktop));events?.desktop?.(structuredClone(desktop));}
function syncState(){state=JSON.parse(localStorage.getItem("test-state") || JSON.stringify(state));}
const recycle:{entry:TrashEntry;item?:Item;shelf?:Snapshot["shelves"][number];children?:Item[]}[]=[];
function trashItem(id:number){const item=state.items.find(i=>i.id===id)!;const shelf=state.shelves.find(s=>s.id===item.shelf_id)!;recycle.push({entry:{id,entity:"item",name:item.name,shelf_id:shelf.id,shelf_name:shelf.name,shelf_kind:shelf.kind,path:item.path,removed_at:Date.now()/1000,children:0},item});state.items=state.items.filter(i=>i.id!==id);save();}
let maximized=false;
const backend:Backend={
 async recoverWindows(){calls.push("recover-windows");return 0;},
 async wakeShortcutState(){return {config:{...wakeConfig},active:wakeAvailable&&wakeConfig.enabled&&!wakePaused,paused:wakePaused,warning:null};},
 async wakeShortcutConfigure(config){calls.push("wake-configure:"+config.accelerator);if(fail){const message=fail;fail="";if(new URLSearchParams(location.search).has("wake-inactive-after-failure"))wakeAvailable=false;throw new Error(message);}wakeConfig={...config};localStorage.setItem("test-wake-shortcut",JSON.stringify(config));return backend.wakeShortcutState!();},
 async wakeShortcutPause(paused){wakePaused=paused;calls.push("wake-pause:"+paused);return backend.wakeShortcutState!();},
 async windowState(){return maximized;},async windowAction(action){calls.push("window:"+action);if(action==="toggle-maximize")maximized=!maximized;return maximized;},
 async removeReferences(ids){ids.forEach(id=>{calls.push("remove:"+id);trashItem(id);});},async recycleActivity(){return [];},
 async trashEntries(filter){return structuredClone(recycle.filter(r=>filter===null||r.entry.shelf_id===filter).map(r=>r.entry));},
 async trashShelf(id){calls.push("trash-shelf:"+id);const shelf=state.shelves.find(s=>s.id===id)!;recycle.push({entry:{id,entity:"shelf",name:shelf.name,shelf_id:id,shelf_name:shelf.name,shelf_kind:shelf.kind,path:shelf.root,removed_at:Date.now()/1000,children:state.items.filter(i=>i.shelf_id===id).length},shelf,children:state.items.filter(i=>i.shelf_id===id)});state.shelves=state.shelves.filter(s=>s.id!==id);state.items=state.items.filter(i=>i.shelf_id!==id);desktop.layout.collapsed=desktop.layout.collapsed.filter(i=>i!==id);if(desktop.layout.active_shelf===id)desktop.layout.active_shelf=state.shelves[0]?.id??0;save();publishDesktop();events.changed?.();},
 async restoreTrash(entity,id){const index=recycle.findIndex(r=>r.entry.entity===entity&&r.entry.id===id);const row=recycle[index];if(!row)throw new Error("回收记录不存在");if(row.item)state.items.push(row.item);if(row.shelf){state.shelves.push(row.shelf);state.items.push(...row.children??[]);if(!desktop.layout.active_shelf)desktop.layout.active_shelf=id;}recycle.splice(index,1);save();publishDesktop();events.changed?.();},
 async purgeTrash(entity,id){const index=recycle.findIndex(r=>r.entry.entity===entity&&r.entry.id===id);if(index>=0)recycle.splice(index,1);return true;},
 async planSystemRecycle(ids){return {ticket:"synthetic-only",items:state.items.filter(i=>ids.includes(i.id)).map(i=>({id:i.id,name:i.name,path:i.path,other_references:0,shelf_kind:"persistent"}))};},
 async executeSystemRecycle(){return [{id:1,status:"cancelled",message:"合成对照：用户取消，文件及引用保留。"}];},
 async cancelSystemRecycle(){calls.push("cancel-system-recycle");},
  async desktopPresent(id,kind){if(desktop.native_dragging)throw new Error("正在投放，形态保持固定。");if(!desktop.entries.some(s=>s.id===id))throw new Error("入口目标已变化");desktop.presentation={kind,shelf_id:kind==="orb"?null:id};publishDesktop();},
  async desktopPeek(id){const shelf=state.shelves.find(s=>s.id===id)!;const items=state.items.filter(i=>i.shelf_id===id);return {shelf:{id,name:shelf.name,kind:shelf.kind},total:items.length,items:await Promise.all(items.slice(-3).reverse().map(async i=>({id:i.id,name:i.name,kind:i.kind,status:i.status,thumbnail:await backend.thumbnail(i.id)})))};},
  async managerOpen(){calls.push("manager-open");},async managementSnapshot(){calls.push("management-snapshot");syncState();return structuredClone(state);},
  async tagReferences(ids,tag,remove){if(fail){const message=fail;fail="";throw new Error(message);}for(const id of ids){const value=state.items.find(i=>i.id===id)!;value.tags=remove?value.tags.filter(t=>t!==tag):[...new Set([...value.tags,tag])];}save();return ids.length;},
  async desktopConfigure(preferences){calls.push(`configure:${preferences.edge}:${preferences.auto_hide}:${preferences.topmost}`);desktop.layout.preferences=preferences;const saved=!new URLSearchParams(location.search).has("readonly-layout");if(!saved)desktop.warning="布局文件只读；本次更改仅临时生效。";publishDesktop();return saved;},
  async desktopHover(inside){calls.push("entry-hover:"+inside);if(inside && desktop.edge_hidden){desktop.edge_hidden=false;publishDesktop();}},
  async createShelf(name,session){if(fail){const message=fail;fail="";throw new Error(message);}name=name.trim();if(!name || state.shelves.some(s=>s.name===name))throw new Error("文件架名称为空或已存在。");const id=Math.max(3,...state.shelves.map(s=>s.id))+1;state.shelves.push({id,name,kind:session?"session":"persistent",root:null,available:true});save();return id;},
  async copyReferences(target,ids){calls.push(`references:${target}:${ids.join(",")}`);let added=0;for(const id of ids){const value=state.items.find(i=>i.id===id)!;if(!state.items.some(i=>i.shelf_id===target && i.path===value.path)){state.items.push({...structuredClone(value),id:next++,shelf_id:target});added++;}}save();return added;},
  async desktopState(){desktop.catalog=state.shelves.map(({id,name,kind})=>({id,name,kind}));return structuredClone(desktop);},async desktopSelect(id){if(ownShelf || desktop.layout.detached?.some(s=>s.shelf_id===id))throw new Error("独立窗口的文件架不可在主窗切换");desktop.layout.active_shelf=id;publishDesktop();},
  async desktopDetach(id){if(fail){const message=fail;fail="";throw new Error(message);}calls.push("detach:"+id);desktop.layout.detached??=[];desktop.layout.detached.push({shelf_id:id,visible:true,topmost:false});desktop.layout.collapsed=desktop.layout.collapsed.filter(value=>value!==id);desktop.layout.active_shelf=state.shelves.find(s=>!desktop.layout.detached!.some(w=>w.shelf_id===s.id))?.id??0;publishDesktop();events.changed?.();},
  async desktopMerge(id){if(fail){const message=fail;fail="";throw new Error(message);}calls.push("merge:"+id);desktop.layout.detached=desktop.layout.detached?.filter(s=>s.shelf_id!==id);desktop.layout.active_shelf=id;publishDesktop();events.changed?.();},
  async desktopCollapse(id){calls.push("collapse:"+id);desktop.layout.enabled=true;desktop.layout.expanded=false;desktop.layout.active_shelf=id;if(!desktop.layout.collapsed.includes(id))desktop.layout.collapsed.push(id);publishDesktop();},
  async desktopOpen(id){calls.push("expand:"+id);if(!desktop.layout.detached?.some(s=>s.shelf_id===id)){desktop.layout.expanded=true;desktop.layout.active_shelf=id;events.activate?.(id);}publishDesktop();},
  async desktopPage(delta){desktop.layout.page+=delta;publishDesktop();},async desktopMove(){calls.push("move-entry");},async desktopDisable(){calls.push("disable-entry");},
  async snapshot(){if(snapshotFailure){const message=snapshotFailure;snapshotFailure="";throw new Error(message);}syncState();const shelves=state.shelves.filter(s=>ownShelf?s.id===ownShelf:!desktop.layout.detached?.some(w=>w.shelf_id===s.id)),allowed=new Set(shelves.map(s=>s.id));return structuredClone({shelves,items:state.items.filter(i=>allowed.has(i.shelf_id)),jobs:state.jobs.filter(j=>!ownShelf || j.shelf_id===ownShelf)});},
  async chooseFiles(){return ["SYNTHETIC/新增文件.txt"];},
  async chooseFolder(){if(!state.shelves.some(s=>s.id===3))state.shelves.push({id:3,name:"测试绑定目录",kind:"bound",root:"SYNTHETIC/target",available:true});save();return 3;},
  async importPaths(shelf,paths){
    calls.push("import:"+shelf+":"+paths.length);
    if(fail){const message=fail;fail="";throw new Error(message);}
    if(shelf!==3){for(const path of paths)state.items.push(item(next++,path.split("/").pop()!,shelf));save();return {added:paths.length,job_id:null,errors:[]};}
    const early=new URLSearchParams(location.search).get("finish-before-import-return");
    if(early && ["failed","completed","cancelled"].includes(early)) {
      const message=early==="failed"?"复制有错误；已完成 0/1 项，来源保留。合成目录被占用。":early==="cancelled"?"已取消；已完成 0/1 项，来源保留。":"复制完成；已完成 1/1 项，来源保留。";
      state.jobs=[{id:1,shelf_id:shelf,status:early,message,staging:null}];save();events.finished(message);
      return {added:0,job_id:1,errors:[]};
    }
    const job={id:1,shelf_id:shelf,status:"copying",message:"复制合成测试文件",staging:null};state.jobs=[job];save();
    setTimeout(()=>events.progress({job_id:1,name:"新增文件.txt",file_index:1,file_count:1,bytes:500,total:1000}),300);
    return {added:0,job_id:1,errors:[]};
  },
  async remove(id){calls.push("remove:"+id);trashItem(id);},
  async open(id){calls.push("open:"+id);if(cancelOpening){cancelOpening=false;return false;}if(fail){const message=fail;fail="";throw new Error(message);}return true;},
  async relocate(id,directory){
    calls.push("relocate:"+id+":"+directory);
    if(cancelRelocation){cancelRelocation=false;return false;}
    if(fail){const message=fail;fail="";throw new Error(message);}
    const value=state.items.find(i=>i.id===id)!;
    value.name=directory?"已重新定位的文件夹":value.name.endsWith(".png")?"已重新定位.png":"已重新定位.txt";
    value.path="SYNTHETIC/重新定位/"+value.name;value.kind=directory?"folder":value.name.endsWith(".png")?"png":"txt";value.status="normal";
    save();return true;
  },
  async tags(id,tags){state.items.find(i=>i.id===id)!.tags=tags;save();},
  async reorder(shelf,ids){calls.push("reorder:"+shelf);const rest=state.items.filter(i=>i.shelf_id!==shelf);state.items=[...rest,...ids.map(id=>state.items.find(i=>i.id===id)!)];save();},
  async thumbnail(id){const value=state.items.find(i=>i.id===id)!;if(value.kind!=="png")return null;const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d")!;context.fillStyle=value.path.includes("重新定位")?"#2563eb":"#dc2626";context.fillRect(0,0,1,1);return canvas.toDataURL();},async drag(ids){calls.push("drag:"+ids.join(","));if(fail){const message=fail;fail="";throw new Error(message);}},
  async reveal(){},async cancel(id){calls.push("cancel:"+id);if(new URLSearchParams(location.search).has("pending-cancel"))return;state.jobs[0].status="cancelled";state.jobs[0].message="已取消，来源保留";save();events.finished("已取消，来源保留");},
  async topmost(){return true;},async quit(){calls.push("quit");},
  async subscribe(value){events=value;const storage=(event:StorageEvent)=>{if(event.key==="test-state"){syncState();events.changed?.();}if(event.key==="test-desktop-layout"){desktop=JSON.parse(event.newValue!);events.desktop?.(structuredClone(desktop));events.changed?.();}};window.addEventListener("storage",storage);return()=>window.removeEventListener("storage",storage);},
};
declare global { interface Window { testHarness:{notifyCopying:(active:boolean)=>void;notifyProgress:(p:Progress)=>void;nativeDrag:(active:boolean,id?:number)=>void;notifyFinished:(message:string)=>void;foldEntry:()=>void;notifyMetadata:()=>void;drop:(paths:string[])=>void;hover:(active:boolean)=>void;offline:(id:number)=>void;fail:(message:string)=>void;failNextSnapshot:(message:string)=>void;missing:(id:number)=>void;image:(id:number)=>void;tags:(id:number,tags:string[])=>Promise<void>;cancelRelocation:()=>void;cancelOpening:()=>void;calls:()=>string[];complete:()=>void} } }
window.testHarness={
  notifyCopying:active=>{desktop.copying=active;publishDesktop();},
  notifyProgress:p=>events.progress(p),
  nativeDrag:(active,id)=>{desktop.native_dragging=active;desktop.drag_target=active?id??1:null;publishDesktop();},
  notifyFinished:message=>events.finished(message),
  foldEntry:()=>{desktop.edge_hidden=true;publishDesktop();},
  notifyMetadata:()=>events.metadata?.(),
  drop:paths=>events.drop(paths),fail:message=>{fail=message;},
  hover:active=>events.hover(active),offline:id=>{state.shelves.find(s=>s.id===id)!.available=false;save();},
  missing:id=>{state.items.find(i=>i.id===id)!.status="missing";save();},
  image:id=>{const value=state.items.find(i=>i.id===id)!;value.name="Alpha.png";value.path="SYNTHETIC/Alpha.png";value.kind="png";save();},
  cancelRelocation:()=>{cancelRelocation=true;},
  cancelOpening:()=>{cancelOpening=true;},
  tags:(id,tags)=>backend.tags(id,tags),
  failNextSnapshot:message=>{snapshotFailure=message;},
  calls:()=>calls,
  complete:()=>{state.items.push(item(next++,"新增文件 (1).txt",3));state.jobs[0].status="completed";state.jobs[0].message="复制完成；来源保留";save();events.finished(state.jobs[0].message);},
};
if(new URLSearchParams(location.search).has("desktop-entry")){const count=Math.max(1,Math.min(8,Number(new URLSearchParams(location.search).get("count")) || 7));state.shelves=state.shelves.slice(0,count);for(let id=3;id<=count;id++)state.shelves.push({id,name:`项目 ${id}`,kind:"persistent",root:null,available:true});desktop.layout.enabled=true;desktop.layout.collapsed=state.shelves.map(s=>s.id);publishDesktop();}
if(new URLSearchParams(location.search).has("edge")){desktop.edge_hidden=true;desktop.layout.preferences={edge:"right",auto_hide:true,topmost:true};}
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("desktop-entry")?<DesktopEntry backend={backend}/>:new URLSearchParams(location.search).has("manager")?<Manager backend={backend}/>:<App backend={backend} native={true} detachedShelfId={ownShelf}/>);
