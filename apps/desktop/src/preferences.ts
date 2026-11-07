import { isSortMode,type SortMode } from "./sorting";
export type ShelfView = { list:boolean; sort:SortMode; size:60|80|120 };
export const defaultView:Readonly<ShelfView>={list:false,sort:"manual",size:80};
const key="ningmao-shelf-views";
const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object" && value!==null && !Array.isArray(value);

export function readViewMemory():{views:Record<string,ShelfView>;warning:string;writable:boolean} {
  const fallback={views:{},warning:"",writable:true};
  try {
    const raw=localStorage.getItem(key);
    if(raw===null)return fallback;
    if(raw.length>100_000)return {...fallback,writable:false,warning:"视图记忆过大，原设置保留；本次使用临时显示"};
    const data:unknown=JSON.parse(raw);
    if(record(data) && Object.prototype.hasOwnProperty.call(data,"version") && data.version!==1 && data.version!==2)
      return {...fallback,writable:false,warning:"此版本的视图记忆无法读取，原设置保留；本次使用临时显示"};
    if(!record(data) || (data.version!==1 && data.version!==2) || !record(data.shelves))throw new Error("invalid preferences");
    const views:Record<string,ShelfView>={};let invalid=false;
    for(const [id,view] of Object.entries(data.shelves)) {
      if(!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !record(view) || typeof view.list!=="boolean" || !isSortMode(view.sort) || typeof view.size!=="number" || ![60,80,120].includes(view.size)) {invalid=true;continue;}
      views[id]={list:view.list,sort:view.sort as ShelfView["sort"],size:view.size as ShelfView["size"]};
    }
    return {views,writable:true,warning:invalid?"部分视图记忆无效，已使用默认；重新选择视图可保存":""};
  } catch {return {...fallback,warning:"视图记忆无法读取，已使用默认；重新选择视图可尝试保存"};}
}
export function writeViewMemory(views:Record<string,ShelfView>,writable:boolean):string {
  if(!writable)return "此版本的视图记忆暂不支持保存，原设置保留；本次调整仅临时生效";
  try {localStorage.setItem(key,JSON.stringify({version:2,shelves:views}));return "";}
  catch {return "视图已切换，但无法保存设置；重启后可能恢复原显示，文件记录不受影响";}
}
export function writeShelfView(id:number,view:ShelfView,writable:boolean):string {
  const latest=readViewMemory();
  return writeViewMemory({...latest.views,[id]:view},writable && latest.writable);
}
export const themes={light:"白色",dark:"深蓝色",blue:"亮蓝色"} as const;
export type Theme=keyof typeof themes;
export function readTheme():Theme {
  try {
    const value=localStorage.getItem("ningmao-theme");
    if(value==="light" || value==="dark" || value==="blue")return value;
    const legacy=localStorage.getItem("ningmao-orb-appearance-v1");
    return legacy==="warm-white"?"light":legacy==="brand-blue"?"blue":"dark";
  }
  catch {return "dark";}
}
export function applyTheme(theme:Theme):void {
  document.documentElement.classList.remove("dark","light","blue");
  document.documentElement.classList.add(theme);
}
export function writeTheme(theme:Theme):string {
  try {localStorage.setItem("ningmao-theme",theme);window.dispatchEvent(new Event("ningmao-theme-changed"));return "";}
  catch {return "主题已切换，但无法保存设置；重启后可能恢复原主题";}
}
export function observeTheme(update:(theme:Theme)=>void):()=>void {
  const read=()=>{try{return localStorage.getItem("ningmao-theme");}catch{return undefined;}};
  let previous=read();
  const refresh=()=>{const value=read();if(value!==undefined && value!==previous){previous=value;update(readTheme());}};
  const storage=(event:StorageEvent)=>{if(event.key===null || event.key==="ningmao-theme")refresh();};
  window.addEventListener("storage",storage);window.addEventListener("focus",refresh);window.addEventListener("ningmao-theme-changed",refresh);
  return()=>{window.removeEventListener("storage",storage);window.removeEventListener("focus",refresh);window.removeEventListener("ningmao-theme-changed",refresh);};
}
