import {ChevronRight,ClipboardPaste,File,Folder,Plus} from "lucide-react";
import type {CatalogShelf,PeekData} from "../backend";
import {OrbFace} from "./OrbFace";
import type {useWindowDrag} from "./useWindowDrag";

export function MorphCapsule({entry,data,locked,active,summary,receipt,drag,onOpen,collecting,onCollect,onLocate,catalog,onOpenOther}:{entry:CatalogShelf;data:PeekData|null;locked:boolean;active:boolean;summary:string;receipt:string;drag:ReturnType<typeof useWindowDrag>;onOpen:()=>void;collecting?:boolean;onCollect?:(action:"add"|"paste")=>void;onLocate?:(item:number)=>void;catalog:CatalogShelf[];onOpenOther:(id:number)=>void}) {
  return <>
    <button {...drag} className="orb-hit" data-testid="morph-capsule" aria-label={`打开 ${entry.name} 文件架`} title={`${entry.name} · Esc收回`} disabled={locked} onClick={onOpen}>
      <span className="orb-body"><OrbFace active={active} locked={locked}/><span className="capsule-copy"><strong>{entry.name}</strong><small role={receipt?"status":undefined} title={receipt||summary}>{summary}</small></span>
      </span>
    </button>
    <span className="capsule-recent" aria-label="最近收集素材">{data?.items.map(item=><button key={item.id} data-testid="capsule-file" aria-label={`定位最近素材 ${item.name}`} title={`${item.name}${item.status!=="normal"?" · 状态待核对":""}`} disabled={locked||!onLocate} onClick={()=>onLocate?.(item.id)}>{item.thumbnail?<img src={item.thumbnail} alt=""/>:item.kind==="folder"?<Folder size={18} aria-hidden="true"/>:<File size={18} aria-hidden="true"/>}</button>)}</span>
    <button className="capsule-action" aria-label="打开完整文件架" title="打开文件架" disabled={locked} onClick={onOpen}><ChevronRight size={16}/></button>
    {onCollect&&<>{([["add","添加",Plus],["paste","粘贴",ClipboardPaste]] as const).map(([action,label,Icon])=><button key={action} className="capsule-action" aria-label={label+"文件到 "+entry.name} title={label+"文件 · "+(entry.kind==="bound"?"复制到目录，保留来源":"仅保存引用")} disabled={locked||collecting} onClick={()=>onCollect(action)}><Icon size={14}/></button>)}</>}
    <select className="capsule-switch" aria-label="打开其他文件架" title="打开其他文件架" value="" disabled={locked} onChange={e=>onOpenOther(Number(e.target.value))}><option value="" disabled>切架</option>{catalog.map(shelf=><option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}</select>
  </>;
}
