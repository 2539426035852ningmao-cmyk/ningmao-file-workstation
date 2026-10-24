export type ShelfView = { list:boolean; sort:"manual"|"name"; size:60|80|120 };
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
    if(record(data) && Object.prototype.hasOwnProperty.call(data,"version") && data.version!==1)
      return {...fallback,writable:false,warning:"此版本的视图记忆无法读取，原设置保留；本次使用临时显示"};
    if(!record(data) || data.version!==1 || !record(data.shelves))throw new Error("invalid preferences");
    const views:Record<string,ShelfView>={};let invalid=false;
    for(const [id,view] of Object.entries(data.shelves)) {
      if(!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !record(view) || typeof view.list!=="boolean" || (view.sort!=="manual" && view.sort!=="name") || typeof view.size!=="number" || ![60,80,120].includes(view.size)) {invalid=true;continue;}
      views[id]={list:view.list,sort:view.sort as ShelfView["sort"],size:view.size as ShelfView["size"]};
    }
    return {views,writable:true,warning:invalid?"部分视图记忆无效，已使用默认；重新选择视图可保存":""};
  } catch {return {...fallback,warning:"视图记忆无法读取，已使用默认；重新选择视图可尝试保存"};}
}
export function writeViewMemory(views:Record<string,ShelfView>,writable:boolean):string {
  if(!writable)return "此版本的视图记忆暂不支持保存，原设置保留；本次调整仅临时生效";
  try {localStorage.setItem(key,JSON.stringify({version:1,shelves:views}));return "";}
  catch {return "视图已切换，但无法保存设置；重启后可能恢复原显示，文件记录不受影响";}
}
export function readTheme():"dark"|"light" {
  try {return localStorage.getItem("ningmao-theme")==="light"?"light":"dark";}
  catch {return "dark";}
}
export function writeTheme(theme:"dark"|"light"):string {
  try {localStorage.setItem("ningmao-theme",theme);return "";}
  catch {return "主题已切换，但无法保存设置；重启后可能恢复原主题";}
}
