import {invoke} from "@tauri-apps/api/core";
import {getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";

export type ChatConfig={base_url:string;model:string;enabled:boolean;has_key:boolean};
export type ChatSession={id:number;title:string};
export type ChatMessage={id:number;role:string;content:string;status:string};
export interface ChatBackend{
  config():Promise<ChatConfig>;
  test():Promise<void>;
  configure(config:Omit<ChatConfig,"has_key">&{api_key:string|null}):Promise<void>;
  sessions():Promise<ChatSession[]>;
  messages(id:number):Promise<ChatMessage[]>;
  create():Promise<number>;
  remove(id:number):Promise<void>;
  send(id:number,text:string):Promise<void>;
  stop(id:number):Promise<void>;
  subscribe(callback:(id:number)=>void):Promise<()=>void>;
}
export const nativeChat:ChatBackend={
  config:()=>invoke("chat_config"),
  test:()=>invoke("chat_test"),
  configure:config=>invoke("chat_configure",{baseUrl:config.base_url,model:config.model,enabled:config.enabled,apiKey:config.api_key}),
  sessions:()=>invoke("chat_sessions"),messages:sessionId=>invoke("chat_messages",{sessionId}),
  create:()=>invoke("chat_new"),remove:sessionId=>invoke("chat_delete",{sessionId}),
  send:(sessionId,text)=>invoke("chat_send",{sessionId,text}),stop:sessionId=>invoke("chat_stop",{sessionId}),
  subscribe:callback=>getCurrentWebviewWindow().listen<{session_id:number}>("chat-updated",event=>callback(event.payload.session_id)),
};
