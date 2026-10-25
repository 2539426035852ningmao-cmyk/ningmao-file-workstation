import {useState} from "react";
import {ArrowLeft,ArrowUpRight,File,Folder,Layers,Palette,X} from "lucide-react";
import {OrbFace} from "./OrbFace";
import {appearances,type OrbAppearance} from "./appearance";
import type {CatalogShelf,PeekData} from "../backend";

export function QuickPeek({entry,data,locked,feedback,error,settings,appearance,catalog,onAppearance,onSettings,onBack,onClose,onOpen,onOpenOther}:{entry:CatalogShelf;data:PeekData|null;locked:boolean;feedback:string;error:boolean;settings:boolean;appearance:OrbAppearance;catalog:CatalogShelf[];onAppearance:(value:OrbAppearance)=>void;onSettings:()=>void;onBack:()=>void;onClose:()=>void;onOpen:()=>void;onOpenOther:(id:number)=>void}) {
  const [list,setList]=useState(false),[query,setQuery]=useState("");
  const semantics=entry.kind==="bound"?"复制到目录 · 保留来源":"仅保存引用";
  return <section className="quick-peek" aria-label={`${entry.name} 轻预览`}>
    <header><OrbFace brand/><div><strong title={entry.name}>{entry.name}</strong><small>{data?`${data.total} 项`:"读取已收集记录…"}</small></div><button aria-label="返回胶囊" disabled={locked} onClick={onBack}><ArrowLeft size={15}/></button><button aria-label="收回圆球" disabled={locked} onClick={onClose}><X size={15}/></button></header>
    {list?<div className="peek-catalog"><input aria-label="搜索文件架" placeholder="搜索文件架" value={query} onChange={e=>setQuery(e.target.value)}/><div>{catalog.filter(s=>s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(s=><button key={s.id} disabled={locked} onClick={()=>onOpenOther(s.id)}>{s.name}<ArrowUpRight size={12}/></button>)}{!catalog.some(s=>s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>没有匹配的文件架</p>}</div></div>:settings?<fieldset className="orb-appearance"><legend>球体外观 · 独立于主题</legend>{Object.entries(appearances).map(([key,value])=><label key={key}><input type="radio" name="orb-appearance" checked={appearance===key} onChange={()=>onAppearance(key as OrbAppearance)}/>{value.name}</label>)}</fieldset>:<div className="peek-content">{data?.items.length?<div className="peek-files">{data.items.map(item=><div key={item.id} data-testid="peek-file" className="peek-file" title={`${item.name}${item.status!=="normal"?" · 状态待核对":""}`}><div>{item.thumbnail?<img src={item.thumbnail} alt=""/>:item.kind==="folder"?<Folder size={28}/>:<File size={28}/>}</div><span>{item.name}</span>{item.status!=="normal" && <small>状态待核对</small>}</div>)}</div>:<p className="peek-empty">{data?"拖入文件，开始收集":"正在读取…"}</p>}</div>}
    {feedback && <p className="peek-feedback" role={error?"alert":"status"}>{feedback}</p>}
    <footer><span title={semantics}>{semantics}</span><button aria-label="更多文件架" disabled={locked} onClick={()=>setList(!list)}><Layers size={15}/></button><button aria-label="入口外观" disabled={locked} onClick={()=>{setList(false);onSettings();}}><Palette size={15}/></button><button className="peek-open" disabled={locked} onClick={onOpen}>打开文件架<ArrowUpRight size={14}/></button></footer>
  </section>;
}
