import {useEffect,useState} from "react";
import {Button} from "./ui/button";
import type {Backend,WakeShortcutConfig,WakeShortcutState} from "../backend";
const initial:WakeShortcutConfig={version:1,enabled:true,accelerator:"Ctrl+Alt+Space"};
const keys=["Space",...Array.from({length:12},(_,i)=>`F${i+1}`),..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
export function WakeShortcutSettings({backend}:{backend:Backend}){
 const [current,setCurrent]=useState<WakeShortcutState|null>(null),[draft,setDraft]=useState(initial),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const accept=(value:WakeShortcutState)=>{setCurrent(value);setDraft(value.config);};
 useEffect(()=>{let live=true;void backend.wakeShortcutState?.().then(value=>{if(live)accept(value);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[backend]);
 if(!backend.wakeShortcutState)return null;
 const split=draft.accelerator.lastIndexOf("+"),modifiers=draft.accelerator.slice(0,split),key=draft.accelerator.slice(split+1),dirty=!!current&&(draft.enabled!==current.config.enabled||draft.accelerator!==current.config.accelerator);
 async function run(action:()=>Promise<WakeShortcutState>){if(busy)return;setBusy(true);setError("");try{accept(await action());}catch(e){setError(String(e));try{setCurrent(await backend.wakeShortcutState!());}catch{setCurrent(null);}}finally{setBusy(false);}}
 return <><h3>全局唤出</h3>{error&&<p role="alert">{error}</p>}<form onSubmit={e=>{e.preventDefault();if(dirty&&backend.wakeShortcutConfigure)void run(()=>backend.wakeShortcutConfigure!(draft));}}>
  <label className="manager-checkbox"><input type="checkbox" aria-label="启用全局唤出快捷键" checked={draft.enabled} disabled={!current||busy} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>启用全局唤出快捷键</label>
  <div className="manager-shortcut-row"><label>组合键<select aria-label="快捷键组合" value={modifiers} disabled={!current||busy||!draft.enabled} onChange={e=>setDraft({...draft,accelerator:`${e.target.value}+${key}`})}><option value="Ctrl+Alt">Ctrl + Alt</option><option value="Ctrl+Shift">Ctrl + Shift</option><option value="Alt+Shift">Alt + Shift</option></select></label><label>按键<select aria-label="快捷键按键" value={key} disabled={!current||busy||!draft.enabled} onChange={e=>setDraft({...draft,accelerator:`${modifiers}+${e.target.value}`})}>{keys.map(key=><option key={key} value={key}>{key==="Space"?"空格":key}</option>)}</select></label></div>
  <div className="manager-shortcut-actions"><Button type="submit" disabled={busy||!dirty}>保存快捷键</Button><Button type="button" variant="outline" disabled={!current||busy||dirty||!current.config.enabled||!backend.wakeShortcutPause} onClick={()=>void run(()=>backend.wakeShortcutPause!(!current!.paused))}>{current?.paused?"恢复快捷键":"暂停快捷键"}</Button></div>
  <p className="manager-note" aria-live="polite">{!current?(error?"快捷键状态暂不可用，请重新打开设置":"正在读取快捷键设置…"):!current.config.enabled?"快捷键已关闭":current.paused?"快捷键已暂停":current.active?`当前：${current.config.accelerator}`:"快捷键未注册，仍可通过托盘打开"}</p>{current?.warning&&<p className="manager-note">{current.warning}</p>}
 </form></>;
}
