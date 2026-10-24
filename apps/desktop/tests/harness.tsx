// This harness is a separate test-only build entry. Production dist contains no mock backend.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import DesktopEntry from "../src/DesktopEntry";
import type { Backend, DesktopView, Events, Item, Snapshot } from "../src/backend";
import "../src/style.css";
const item=(id:number,name:string,shelf_id=1):Item=>({id,name,shelf_id,path:"SYNTHETIC/"+name,kind:"txt",bytes:200,modified:1,status:"normal",tags:[]});
const initial:Snapshot={shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},{id:2,name:"本次中转",kind:"session",root:null,available:true}],items:[item(1,"Alpha.txt"),item(2,"中文 文件.txt"),item(3,"Gamma.txt")],jobs:[]};
let state:Snapshot=JSON.parse(localStorage.getItem("test-state") || JSON.stringify(initial));
let events:Events;let fail="";let snapshotFailure="";let next=10;let cancelRelocation=false;let cancelOpening=false;const calls:string[]=[];
const save=()=>localStorage.setItem("test-state",JSON.stringify(state));
let desktop:DesktopView={layout:{enabled:false,expanded:true,active_shelf:1,collapsed:[],page:0},entries:[],total:0,warning:null};
function publishDesktop(){desktop.entries=desktop.layout.collapsed.slice(desktop.layout.page*5,desktop.layout.page*5+5).map(id=>state.shelves.find(s=>s.id===id)!);desktop.total=desktop.layout.collapsed.length;events?.desktop?.(structuredClone(desktop));}
const backend:Backend={
  async createShelf(name,session){if(fail){const message=fail;fail="";throw new Error(message);}name=name.trim();if(!name || state.shelves.some(s=>s.name===name))throw new Error("文件架名称为空或已存在。");const id=Math.max(3,...state.shelves.map(s=>s.id))+1;state.shelves.push({id,name,kind:session?"session":"persistent",root:null,available:true});save();return id;},
  async copyReferences(target,ids){calls.push(`references:${target}:${ids.join(",")}`);let added=0;for(const id of ids){const value=state.items.find(i=>i.id===id)!;if(!state.items.some(i=>i.shelf_id===target && i.path===value.path)){state.items.push({...structuredClone(value),id:next++,shelf_id:target});added++;}}save();return added;},
  async desktopState(){return structuredClone(desktop);},async desktopSelect(id){desktop.layout.active_shelf=id;},
  async desktopCollapse(id){calls.push("collapse:"+id);desktop.layout.enabled=true;desktop.layout.expanded=false;desktop.layout.active_shelf=id;if(!desktop.layout.collapsed.includes(id))desktop.layout.collapsed.push(id);publishDesktop();},
  async desktopOpen(id){calls.push("expand:"+id);desktop.layout.expanded=true;desktop.layout.active_shelf=id;events.activate?.(id);},
  async desktopPage(delta){desktop.layout.page+=delta;publishDesktop();},async desktopMove(){calls.push("move-entry");},async desktopDisable(){calls.push("disable-entry");},
  async snapshot(){if(snapshotFailure){const message=snapshotFailure;snapshotFailure="";throw new Error(message);}return structuredClone(state);},
  async chooseFiles(){return ["SYNTHETIC/新增文件.txt"];},
  async chooseFolder(){if(!state.shelves.some(s=>s.id===3))state.shelves.push({id:3,name:"测试绑定目录",kind:"bound",root:"SYNTHETIC/target",available:true});save();return 3;},
  async importPaths(shelf,paths){
    calls.push("import:"+shelf+":"+paths.length);
    if(fail){const message=fail;fail="";throw new Error(message);}
    if(shelf!==3){for(const path of paths)state.items.push(item(next++,path.split("/").pop()!,shelf));save();return {added:paths.length,job_id:null,errors:[]};}
    const job={id:1,shelf_id:shelf,status:"copying",message:"复制合成测试文件",staging:null};state.jobs=[job];save();
    setTimeout(()=>events.progress({job_id:1,name:"新增文件.txt",file_index:1,file_count:1,bytes:500,total:1000}),300);
    return {added:0,job_id:1,errors:[]};
  },
  async remove(id){calls.push("remove:"+id);state.items=state.items.filter(i=>i.id!==id);save();},
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
  async reveal(){},async cancel(){state.jobs[0].status="cancelled";state.jobs[0].message="已取消，来源保留";save();events.finished("已取消，来源保留");},
  async topmost(){return true;},async quit(){calls.push("quit");},
  async subscribe(value){events=value;return()=>{};},
};
declare global { interface Window { testHarness:{drop:(paths:string[])=>void;hover:(active:boolean)=>void;offline:(id:number)=>void;fail:(message:string)=>void;failNextSnapshot:(message:string)=>void;missing:(id:number)=>void;image:(id:number)=>void;tags:(id:number,tags:string[])=>Promise<void>;cancelRelocation:()=>void;cancelOpening:()=>void;calls:()=>string[];complete:()=>void} } }
window.testHarness={
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
if(new URLSearchParams(location.search).has("desktop-entry")){for(let id=3;id<=7;id++)state.shelves.push({id,name:`项目 ${id}`,kind:"persistent",root:null,available:true});desktop.layout.enabled=true;desktop.layout.collapsed=state.shelves.map(s=>s.id);publishDesktop();}
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("desktop-entry")?<DesktopEntry backend={backend}/>:<App backend={backend} native={true}/>);
