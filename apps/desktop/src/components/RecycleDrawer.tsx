import {useEffect,useState} from "react";
import type {Backend,TrashEntry,RecycleActivity} from "../backend";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "./ui/sheet";
import {Button} from "./ui/button";
export function RecycleDrawer({backend,open,onOpenChange,shelfId,onChanged}:{backend:Backend;open:boolean;onOpenChange:(v:boolean)=>void;shelfId:number;onChanged:()=>Promise<unknown>}){
 const [activity,setActivity]=useState<RecycleActivity[]>([]);
 const [filter,setFilter]=useState<number|null>(null),[rows,setRows]=useState<TrashEntry[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const [records,operations]=await Promise.all([backend.trashEntries?.(null)??[],backend.recycleActivity?.()??[]]);setRows(records);setActivity(operations);}
 useEffect(()=>{if(open){void refresh().catch(e=>setError(String(e)));}},[open,filter,shelfId]);
 async function act(row:TrashEntry,purge=false){setBusy(true);setError("");try{if(purge)await backend.purgeTrash?.(row.entity,row.id);else await backend.restoreTrash?.(row.entity,row.id);await refresh();await onChanged();}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <Sheet open={open} onOpenChange={v=>{if(!busy)onOpenChange(v);}}><SheetContent className="recycle-drawer"><SheetHeader><SheetTitle>柠猫回收站</SheetTitle><SheetDescription>仅保存移除的文件架与引用。长期保留，原文件不受影响；恢复引用不会从 Windows 回收站还原实体文件。</SheetDescription></SheetHeader>
 <label>查看范围<select aria-label="回收站范围" value={filter??"all"} onChange={e=>setFilter(e.target.value==="all"?null:Number(e.target.value))}><option value="all">全部文件架</option>{shelfId>0&&<option value={shelfId}>当前文件架</option>}{[...new Map(rows.filter(r=>r.shelf_id!==shelfId).map(r=>[r.shelf_id,r.shelf_name])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 {error&&<p role="alert">{error}</p>}<div className="recycle-list" data-scroll-surface>
 {activity.filter(r=>filter===null||r.shelf_id===filter).map(row=><section className="recycle-row" key={"operation"+row.id}><strong>{row.name} · 系统回收待核对</strong><p role="alert">{row.message||"系统操作尚未完成，请勿重复回收。"}</p><small>保留原引用；请在 Windows 回收站核对。不会自动重试实体操作。</small></section>)}
 {rows.filter(r=>filter===null||r.shelf_id===filter).length?rows.filter(r=>filter===null||r.shelf_id===filter).map(row=><section key={row.entity+row.id} className="recycle-row"><strong>{row.name}</strong><small>{row.entity==="shelf"?`整个文件架 · ${row.children} 项记录`:row.shelf_name} · {new Date(row.removed_at*1000).toLocaleString()}</small>{row.path&&<span title={row.path}>{row.path}</span>}<div><Button disabled={busy} variant="outline" onClick={()=>void act(row)}>恢复</Button><Button disabled={busy} variant="ghost" onClick={()=>void act(row,true)}>永久清理记录</Button></div></section>):<p className="muted">回收站为空</p>}</div></SheetContent></Sheet>;
}
