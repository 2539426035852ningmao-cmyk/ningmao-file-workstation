// This harness is a separate test-only build entry. Production dist contains no mock backend.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import type { Backend, Events, Item, Snapshot } from "../src/backend";
import "../src/style.css";
const item=(id:number,name:string,shelf_id=1):Item=>({id,name,shelf_id,path:"SYNTHETIC/"+name,kind:"txt",bytes:200,modified:1,status:"normal",tags:[]});
const initial:Snapshot={shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},{id:2,name:"本次中转",kind:"session",root:null,available:true}],items:[item(1,"Alpha.txt"),item(2,"中文 文件.txt"),item(3,"Gamma.txt")],jobs:[]};
let state:Snapshot=JSON.parse(localStorage.getItem("test-state") || JSON.stringify(initial));
let events:Events;let fail="";let snapshotFailure="";let next=10;let cancelRelocation=false;const calls:string[]=[];
const save=()=>localStorage.setItem("test-state",JSON.stringify(state));
const backend:Backend={
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
  async thumbnail(id){const value=state.items.find(i=>i.id===id)!;if(value.kind!=="png")return null;const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d")!;context.fillStyle=value.path.includes("重新定位")?"#2563eb":"#dc2626";context.fillRect(0,0,1,1);return canvas.toDataURL();},async drag(ids){calls.push("drag:"+ids.join(","));},
  async reveal(){},async cancel(){state.jobs[0].status="cancelled";state.jobs[0].message="已取消，来源保留";save();events.finished("已取消，来源保留");},
  async topmost(){return true;},async quit(){calls.push("quit");},
  async subscribe(value){events=value;return()=>{};},
};
declare global { interface Window { testHarness:{drop:(paths:string[])=>void;fail:(message:string)=>void;failNextSnapshot:(message:string)=>void;missing:(id:number)=>void;image:(id:number)=>void;cancelRelocation:()=>void;calls:()=>string[];complete:()=>void} } }
window.testHarness={
  drop:paths=>events.drop(paths),fail:message=>{fail=message;},
  missing:id=>{state.items.find(i=>i.id===id)!.status="missing";save();},
  image:id=>{const value=state.items.find(i=>i.id===id)!;value.name="Alpha.png";value.path="SYNTHETIC/Alpha.png";value.kind="png";save();},
  cancelRelocation:()=>{cancelRelocation=true;},
  failNextSnapshot:message=>{snapshotFailure=message;},
  calls:()=>calls,
  complete:()=>{state.items.push(item(next++,"新增文件 (1).txt",3));state.jobs[0].status="completed";state.jobs[0].message="复制完成；来源保留";save();events.finished(state.jobs[0].message);},
};
createRoot(document.getElementById("root")!).render(<App backend={backend} native={true}/>);
