import {useEffect,useState} from "react";
import type {Backend,SystemRecyclePreview,SystemRecycleOutcome} from "../backend";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "./ui/sheet";
import {Button} from "./ui/button";
export function SystemRecycle({backend,ids,onClose,onChanged}:{backend:Backend;ids:number[]|null;onClose:()=>void;onChanged:()=>Promise<unknown>}){
 const [plan,setPlan]=useState<SystemRecyclePreview|null>(null),[result,setResult]=useState<SystemRecycleOutcome[]|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;setPlan(null);setResult(null);setError("");if(ids)void backend.planSystemRecycle?.(ids).then(p=>{if(live)setPlan(p);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[ids,backend]);
 async function execute(){if(!plan)return;setBusy(true);setError("");try{setResult(await backend.executeSystemRecycle?.(plan.ticket)??[]);await onChanged();}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <Sheet open={ids!==null} onOpenChange={v=>{if(!v&&!busy)onClose();}}><SheetContent className="recycle-drawer"><SheetHeader><SheetTitle>移入 Windows 回收站</SheetTitle><SheetDescription>这会操作真实文件，包含引用指向的外部原文件。不会永久删除兜底。请先检查影响范围。</SheetDescription></SheetHeader>{error&&<p role="alert">{error}</p>}
 <div className="recycle-list" data-scroll-surface>{plan?.items.map(item=><section className="recycle-row" key={item.id}><strong>{item.name}</strong><span title={item.path}>{item.path}</span><small>{item.shelf_kind==="bound"?"绑定目录中的真实文件":"外部原始文件"} · 其他同路径引用 {item.other_references} 项</small><p>成功后，仅发起引用进入软件回收站；其他架保留失效引用和标签。</p></section>)}{result?.map(row=><p key={row.id} role={row.status==="success"?"status":"alert"}>{row.message}</p>)}</div>
 <p className="muted">软件恢复仅还原记录。实体文件必须在 Windows 回收站恢复。当前只支持本地普通文件，目录、链接和受保护路径会被拒绝。</p>
 {result?<Button onClick={onClose}>完成</Button>:busy?<Button variant="outline" onClick={()=>void backend.cancelSystemRecycle?.().catch(e=>setError(String(e)))}>取消剩余回收</Button>:<Button disabled={!plan||!!error} onClick={()=>void execute()}>继续并再次确认</Button>}
 </SheetContent></Sheet>;
}
