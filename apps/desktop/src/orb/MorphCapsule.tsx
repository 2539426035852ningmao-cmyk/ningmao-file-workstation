import {ChevronRight,File,Folder} from "lucide-react";
import type {CatalogShelf,PeekData} from "../backend";
import {OrbFace} from "./OrbFace";
import type {useWindowDrag} from "./useWindowDrag";

export function MorphCapsule({entry,data,locked,active,summary,receipt,drag,onOpen,catalog,onOpenOther}:{entry:CatalogShelf;data:PeekData|null;locked:boolean;active:boolean;summary:string;receipt:string;drag:ReturnType<typeof useWindowDrag>;onOpen:()=>void;catalog:CatalogShelf[];onOpenOther:(id:number)=>void}) {
  return <>
    <button {...drag} className="orb-hit" data-testid="morph-capsule" aria-label={`打开 ${entry.name} 文件架`} title={`${entry.name} · 点击打开文件架 · Esc收回圆球`} disabled={locked} onClick={onOpen}>
      <span className="orb-body"><OrbFace active={active} locked={locked}/><span className="capsule-copy"><strong>{entry.name}</strong><small role={receipt?"status":undefined} title={receipt||summary}>{summary}</small></span>
        <span className="capsule-recent" aria-label="最近收集素材">{data?.items.map(item=><span key={item.id} data-testid="capsule-file" title={`${item.name}${item.status!=="normal"?" · 状态待核对":""}`}>{item.thumbnail?<img src={item.thumbnail} alt={item.name}/>:item.kind==="folder"?<Folder size={18} aria-label={item.name}/>:<File size={18} aria-label={item.name}/>}</span>)}</span>
        <ChevronRight className="capsule-arrow" size={16}/>
      </span>
    </button>
    <select className="capsule-switch" aria-label="打开其他文件架" title="打开其他文件架" value="" disabled={locked} onChange={e=>onOpenOther(Number(e.target.value))}><option value="" disabled>切架</option>{catalog.map(shelf=><option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}</select>
  </>;
}
