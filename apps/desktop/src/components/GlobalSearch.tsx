import {useEffect,useRef,useState} from "react";
import {File,Search,X} from "lucide-react";
import {Sheet,SheetClose,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "./ui/sheet";
import {Input} from "./ui/input";
import {Button} from "./ui/button";
import type {Backend,SearchHit,SearchResponse} from "../backend";

const empty:SearchResponse={hits:[],truncated:false};
const statuses:Record<string,string>={normal:"正常",missing:"引用失效",offline:"离线",unavailable:"无法读取"};
export function GlobalSearch({backend,revision,scoped=false}:{backend:Backend;revision:unknown;scoped?:boolean}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[kind,setKind]=useState("all"),[source,setSource]=useState("all"),[status,setStatus]=useState("all");
  const [response,setResponse]=useState(empty),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [retry,setRetry]=useState(0),[active,setActive]=useState(0),[locating,setLocating]=useState(false);
  const navigating=useRef(false),list=useRef<HTMLDivElement>(null),live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"&&!e.altKey&&!e.isComposing){e.preventDefault();setOpen(value=>!value);}};
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[]);
  useEffect(()=>{
    let current=true;
    setResponse(empty);setError("");setActive(0);
    if(!open){setQuery("");setKind("all");setSource("all");setStatus("all");setLoading(false);return;}
    if(!query.trim()&&kind==="all"&&source==="all"&&status==="all"){setLoading(false);return;}
    setLoading(true);
    const timer=setTimeout(()=>{
      if(!backend.searchMetadata){setError("此版本暂不支持搜索。");setLoading(false);return;}
      void backend.searchMetadata(query,kind,source,status).then(value=>{if(current)setResponse(value);}).catch(()=>{if(current)setError("搜索暂时不可用，请重试。");}).finally(()=>{if(current)setLoading(false);});
    },120);
    return()=>{current=false;clearTimeout(timer);};
  },[open,query,kind,source,status,retry,revision,backend]);
  useEffect(()=>{list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest"});},[active,response]);
  async function locate(hit:SearchHit){
    const ref=hit.references[0];if(!ref||locating)return;
    setLocating(true);setError("");
    try{if(!backend.focusSearchResult)throw new Error();await backend.focusSearchResult(ref.shelf_id,ref.item_id);if(live.current){navigating.current=true;setOpen(false);}}
    catch{if(live.current)setError("结果已变化或窗口暂不可用，请重新搜索。");}
    finally{if(live.current)setLocating(false);}
  }
  return <Sheet open={open} onOpenChange={setOpen}><SheetContent side="top" className="global-search" showCloseButton={false} onCloseAutoFocus={e=>{if(navigating.current){e.preventDefault();navigating.current=false;}}}>
    <SheetHeader><SheetTitle>{scoped?"搜索当前文件架":"跨文件架搜索"}</SheetTitle><SheetDescription>检索已收录的名称与标签，不扫描其他目录。</SheetDescription></SheetHeader>
    <SheetClose asChild><Button variant="ghost" size="icon" className="global-search-close" aria-label="关闭搜索"><X size={16}/></Button></SheetClose>
    <div className="global-search-controls"><label className="global-search-input"><Search size={16}/><Input autoFocus aria-label="名称或标签" placeholder="名称或标签…" maxLength={160} value={query} onChange={e=>setQuery(e.target.value)} aria-controls="search-results" aria-activedescendant={response.hits.length?`search-hit-${active}`:undefined} onKeyDown={e=>{
      if(e.nativeEvent.isComposing)return;
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setActive(value=>Math.max(0,Math.min(response.hits.length-1,value+(e.key==="ArrowDown"?1:-1))));}
      if(e.key==="Enter"&&response.hits[active]){e.preventDefault();void locate(response.hits[active]);}
    }}/></label></div>
    <div className="global-search-filters"><select aria-label="搜索类型" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部类型</option><option value="image">图片</option><option value="video">视频</option><option value="document">文档</option><option value="audio">音频</option><option value="folder">文件夹</option><optgroup label="常用格式">{["png","jpg","webp","pdf","txt"].map(value=><option key={value} value={value}>{value.toUpperCase()}</option>)}</optgroup></select><select aria-label="文件架类型" value={source} onChange={e=>setSource(e.target.value)}><option value="all">全部架</option><option value="persistent">收集架</option><option value="session">中转架</option><option value="bound">绑定目录</option></select><select aria-label="文件状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">全部状态</option><option value="normal">正常</option><option value="missing">引用失效</option><option value="offline">离线</option><option value="unavailable">无法读取</option></select></div>
    {error?<div className="global-search-message"><p role="alert">{error}</p><Button variant="outline" onClick={()=>setRetry(value=>value+1)}>重试搜索</Button></div>:<>
      <p className="global-search-summary" role="status">{locating?"正在定位…":loading?"正在搜索…":!query.trim()&&kind==="all"&&source==="all"&&status==="all"?"输入关键词，或选择筛选条件。":response.hits.length?`${response.hits.length} 个文件${response.truncated?"，仅显示前 50 项，请缩小条件":""}`:"没有匹配的文件"}</p>
      <div ref={list} id="search-results" className="global-search-results" role="listbox" aria-label="搜索结果" aria-busy={loading}>
        {response.hits.map((hit,index)=><button key={hit.references.map(r=>r.item_id).join(",")} id={`search-hit-${index}`} type="button" role="option" aria-selected={active===index} disabled={locating} onFocus={()=>setActive(index)} onClick={()=>void locate(hit)}>
          <File size={20} aria-hidden="true"/><span className="global-search-info"><strong>{hit.name}</strong><span>{[...new Set(hit.references.map(r=>r.shelf_name))].join(" · ")}</span><small>{hit.kind.toUpperCase()} · {statuses[hit.status]??"无法读取"}{hit.match_kind==="tag"?" · 标签匹配":""}</small></span>{hit.references.length>1&&<span className="global-search-count">{hit.references.length} 处引用</span>}
        </button>)}
      </div>
    </>}
    <footer>Enter 定位 · Esc 关闭<span>Ctrl+K</span></footer>
  </SheetContent></Sheet>;
}
