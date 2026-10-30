import {useEffect,useRef,useState} from "react";
import {Settings,Plus,Trash2,X} from "lucide-react";
import Markdown from "react-markdown";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "./ui/sheet";
import {Button} from "./ui/button";
import {Input} from "./ui/input";
import type {ChatBackend,ChatConfig,ChatMessage,ChatSession} from "../chatBackend";

const defaults:ChatConfig={base_url:"",model:"",enabled:false,has_key:false};
export function ChatPanel({backend,open,onOpenChange}:{backend:ChatBackend;open:boolean;onOpenChange:(value:boolean)=>void}){
  const [config,setConfig]=useState(defaults),[settings,setSettings]=useState(false),[key,setKey]=useState<string|null>(null);
  const [sessions,setSessions]=useState<ChatSession[]>([]),[session,setSession]=useState(0),[messages,setMessages]=useState<ChatMessage[]>([]);
  const [text,setText]=useState(""),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const [testing,setTesting]=useState(false),[testResult,setTestResult]=useState("");
  const active=useRef(0),log=useRef<HTMLDivElement>(null);
  async function history(){const rows=await backend.sessions();setSessions(rows);return rows;}
  useEffect(()=>{if(!open)return;let live=true;void Promise.all([backend.config(),backend.sessions()]).then(([value,rows])=>{if(!live)return;setConfig(value);setSessions(rows);setSession(current=>rows.some(row=>row.id===current)?current:rows[0]?.id??0);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[backend,open]);
  useEffect(()=>{active.current=session;if(!open)return;let live=true;setMessages([]);if(session)void backend.messages(session).then(rows=>{if(live)setMessages(rows);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[backend,session,open]);
  useEffect(()=>{if(!open)return;let live=true;let cleanup:(()=>void)|undefined;void backend.subscribe(id=>{if(id===active.current)void backend.messages(id).then(rows=>{if(live&&id===active.current)setMessages(rows);}).catch(e=>{if(live)setError(String(e));});}).then(fn=>{if(live)cleanup=fn;else fn();}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;cleanup?.();};},[backend,open]);
  useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight});},[messages]);
  async function send(){if(busy||testing||!config.enabled||!text.trim())return;setBusy(true);setError("");try{const id=session||await backend.create();setSession(id);active.current=id;const value=text.trim();setText("");await backend.send(id,value);setMessages(await backend.messages(id));await history();}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="chat-panel" showCloseButton={false}>
    <SheetHeader><SheetTitle>AI 对话</SheetTitle><SheetDescription>{config.enabled?config.model:"配置模型后开始对话"}</SheetDescription></SheetHeader>
    <div className="chat-tools"><Button variant="ghost" size="icon" title="新建对话" aria-label="新建对话" disabled={busy} onClick={()=>{setSession(0);setMessages([]);setError("");}}><Plus size={16}/></Button><Button variant="ghost" size="icon" title="删除当前对话" aria-label="删除当前对话" disabled={busy||!session} onClick={()=>{void backend.remove(session).then(async()=>{const rows=await history();setSession(rows[0]?.id??0);}).catch(e=>setError(String(e)));}}><Trash2 size={16}/></Button><Button variant="ghost" size="icon" aria-label="模型设置" onClick={()=>setSettings(value=>!value)}><Settings size={16}/></Button><Button variant="ghost" size="icon" aria-label="关闭 AI 对话" onClick={()=>onOpenChange(false)}><X size={16}/></Button></div>
    {settings?<form className="chat-settings" onSubmit={event=>{event.preventDefault();setSaving(true);setError("");void backend.configure({...config,api_key:key}).then(async()=>{setConfig(await backend.config());setKey(null);setSettings(false);}).catch(e=>setError(String(e))).finally(()=>setSaving(false));}}>
      <label>服务地址<Input aria-label="服务地址" placeholder="https://服务商地址/v1" value={config.base_url} onChange={e=>setConfig({...config,base_url:e.target.value})}/></label>
      <label>模型 ID<Input aria-label="模型 ID" value={config.model} onChange={e=>setConfig({...config,model:e.target.value})}/></label>
      <label>API Key<Input type="password" autoComplete="off" aria-label="API Key" placeholder={config.has_key?"已保存，留空保留":"本地服务可不填"} value={key??""} onChange={e=>setKey(e.target.value)}/><small className="muted">更换服务地址时需重新输入密钥</small></label>
      {config.has_key&&<Button type="button" variant="outline" onClick={()=>setKey("")}>清除已存密钥</Button>}
      <label className="chat-enable"><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/>启用模型服务</label>
      <p className="muted">支持兼容接口及本机模型服务。发送内容会交给所配置服务，费用以服务商为准。</p>
      <Button type="submit" disabled={saving||busy||testing}>{saving?"保存中…":"保存设置"}</Button>
      {testing?<Button type="button" variant="outline" onClick={()=>void backend.stop(0).catch(e=>setError(String(e)))}>停止模型测试</Button>:<Button type="button" variant="outline" disabled={saving||busy} title="测试已保存的配置，会发送一条短消息，可能产生模型费用" onClick={()=>{setTesting(true);setError("");setTestResult("");void backend.test().then(()=>setTestResult("模型已返回有效回复")).catch(e=>setError(String(e))).finally(()=>setTesting(false));}}>测试已保存配置</Button>}
      {testResult&&<p role="status">{testResult}</p>}
    </form>:<>
      <select className="chat-history" aria-label="历史对话" value={session} disabled={busy} onChange={e=>setSession(Number(e.target.value))}><option value={0}>新对话</option>{sessions.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</select>
      <div ref={log} className="chat-messages" role="log" aria-label="聊天记录" aria-live="polite">{messages.map(row=><article key={row.id} className={`chat-message chat-${row.role}`}><small>{row.role==="user"?"你":"AI"}{row.status==="stopped"?" · 已停止":row.status==="failed"?" · 失败":""}</small><div>{row.role==="user"?row.content:<Markdown skipHtml disallowedElements={["img"]} components={{a:({children})=><span>{children}</span>,pre:({children})=><div className="chat-code"><pre>{children}</pre><Button variant="ghost" size="sm" onClick={e=>void navigator.clipboard.writeText(e.currentTarget.previousElementSibling?.textContent??"").catch(()=>setError("复制失败，请手动选择代码"))}>复制代码</Button></div>}}>{row.content||"正在回复…"}</Markdown>}</div></article>)}{!messages.length&&<p className="muted">{config.enabled?"开始一段新对话":"先在模型设置中配置服务"}</p>}</div>
      <form className="chat-composer" onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="消息" placeholder="输入消息…" value={text} maxLength={16000} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>{busy?<Button type="button" variant="outline" onClick={()=>void backend.stop(active.current).catch(e=>setError(String(e)))}>停止生成</Button>:<Button type="submit" disabled={!config.enabled||!text.trim()}>发送</Button>}</form>
    </>}{error&&<p className="chat-error" role="alert">{error}</p>}
  </SheetContent></Sheet>;
}
