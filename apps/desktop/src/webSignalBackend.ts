import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";

/** Native WSS handshake bridge. No file data, saved-file receipts, JWT or Store tickets. */
export type WebSignalOutbound =
  | {type:"description";to:string;payload:{id:string;description:{type:"offer"|"answer";sdp:string}}}
  | {type:"candidate";to:string;payload:{id:string;candidate:Record<string,unknown>}}
  | {type:"cancel";to:string;payload:{id:string}}
  | {type:"decision";to:string;payload:{id:string;accepted:false}};
export type WebSignalInbound = {
  type:"description"|"candidate"|"decision"|"receipt"|"cancel";
  from:string;
  payload:Record<string,unknown>&{id:string};
};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function isSignal(value:unknown):value is WebSignalInbound{
  if(!value||typeof value!=="object")return false;
  const v=value as Record<string,unknown>;
  if(typeof v.from!=="string"||!uuid.test(v.from))return false;
  if(!["description","candidate","decision","receipt","cancel"].includes(String(v.type)))return false;
  if(!v.payload||typeof v.payload!=="object"||Array.isArray(v.payload))return false;
  const body=v.payload as Record<string,unknown>;
  return typeof body.id==="string"&&uuid.test(body.id);
}
export const nativeWebSignal={
  send:(message:WebSignalOutbound):Promise<void>=>invoke("web_device_send_signal",{signal:message}),
  async subscribe(onSignal:(signal:WebSignalInbound)=>void):Promise<()=>void>{
    return listen<unknown>("web-device-signal",event=>{
      if(isSignal(event.payload))onSignal(event.payload);
    });
  },
  async subscribeConnection(onConnection:(connected:boolean)=>void):Promise<()=>void>{
    return listen<unknown>("web-device-connection",event=>{
      const payload=event.payload;
      if(payload&&typeof payload==="object"&&!Array.isArray(payload)
        &&typeof (payload as {connected?:unknown}).connected==="boolean"){
        onConnection((payload as {connected:boolean}).connected);
      }
    });
  }
};
