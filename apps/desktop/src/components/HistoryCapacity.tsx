import {useEffect,useRef,useState} from "react";
import {Input} from "./ui/input";

export function HistoryCapacity({capacity,onSave}:{capacity:number;onSave?:((capacity:number)=>Promise<void>)}){
  const [value,setValue]=useState(String(capacity)),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  const editing=useRef(false);
  useEffect(()=>{if(!editing.current)setValue(String(capacity));},[capacity]);
  async function save(){
    editing.current=false;const number=Number(value);
    if(!value.trim()||!Number.isInteger(number)||number<1||number>1000){setError("请输入1至1000之间的整数");return;}
    setError("");if(!onSave||number===capacity)return;
    setSaving(true);try{await onSave(number);setValue(String(number));}catch(error){setError(String(error));}finally{setSaving(false);}
  }
  return <div><label className="history-capacity">撤销历史容量<Input aria-label="撤销历史容量" aria-invalid={!!error} aria-describedby={error?"history-capacity-error":undefined} type="number" min={1} max={1000} value={value} disabled={!onSave||saving} onFocus={()=>{editing.current=true;}} onChange={event=>{setValue(event.target.value);setError("");}} onKeyDown={event=>{event.stopPropagation();if(event.key==="Enter"){event.preventDefault();event.currentTarget.blur();}}} onBlur={()=>void save()}/><span>步</span></label>{error&&<p id="history-capacity-error" className="history-error" role="alert">{error}</p>}</div>;
}
