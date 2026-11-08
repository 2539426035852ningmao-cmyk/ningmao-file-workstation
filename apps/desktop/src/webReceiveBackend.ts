import {invoke} from "@tauri-apps/api/core";
import type {DesktopWebRTCOffer} from "./webTransferBackend";
import {safeWebFileName, WEB_MAX_FILE_BYTES, WEB_CHUNK_BYTES} from "./webFileRules";

/** W3: Only called after the Windows owner explicitly accepts a transfer.
 * This is NOT an authenticated network transport. File paths never come from peers.
 */
export type WindowsWebReceipt = {
  job_id: number;
  file_name: string;
  bytes: number;
  status: "completed";
};
type Started = {ticket:string;job_id:number;bytes:number;expires_in_seconds:number};
type ChunkAck = {received:number;total:number};
function bytesToBase64(chunk:Uint8Array) {
  let raw="";
  for(let i=0;i<chunk.length;i++)raw+=String.fromCharCode(chunk[i]);
  return btoa(raw);
}
function hex(raw:ArrayBuffer) {
  return Array.from(new Uint8Array(raw)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
export const nativeWebReceiver = {
  prepare(shelfId:number,ticket:string,name:string,bytes:number,sha256:string):Promise<Started>{
    return invoke("web_receive_prepare",{shelfId,ticket,name,bytes,sha256});
  },
  append(ticket:string,offset:number,dataBase64:string):Promise<ChunkAck>{
    return invoke("web_receive_append",{ticket,offset,dataBase64});
  },
  finish(ticket:string):Promise<WindowsWebReceipt>{
    return invoke("web_receive_finish",{ticket});
  },
  abort(ticket:string):Promise<void>{
    return invoke("web_receive_abort",{ticket});
  }
};
/** The WebRTC controller must authenticate the peer and obtain local owner consent
 * BEFORE invoking this function. This helper only checks bytes and writes safely
 * through the native Store's unique-name copy and job terminal transitions.
 */
export async function saveAcceptedWebFile(
  shelfId:number, offer:DesktopWebRTCOffer, signal?:AbortSignal
):Promise<WindowsWebReceipt>{
  const {manifest,bytes}=offer;
  if(!Number.isSafeInteger(shelfId) || shelfId<=0 ||
    !Number.isSafeInteger(manifest.size) || manifest.size<0 ||
    manifest.size>WEB_MAX_FILE_BYTES || bytes.byteLength!==manifest.size ||
    !safeWebFileName(manifest.name) || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error("远端文件清单不安全，拒绝写入");
  }
  if(signal?.aborted)throw new Error("接收已取消");
  const actual=hex(await crypto.subtle.digest("SHA-256",bytes));
  if(actual!==manifest.sha256.toLowerCase())throw new Error("远端文件摘要不匹配，未写入本机");
  if(signal?.aborted)throw new Error("接收已取消");
  const ticket=crypto.randomUUID();
  let prepared=false;
  try{
    const started=await nativeWebReceiver.prepare(shelfId,ticket,manifest.name,bytes.byteLength,actual);
    prepared=true;
    if(started.ticket!==ticket || started.bytes!==bytes.byteLength)
      throw new Error("本机接收票据或大小不一致");
    const view=new Uint8Array(bytes);
    for(let offset=0;offset<view.length;offset+=WEB_CHUNK_BYTES){
      if(signal?.aborted)throw new Error("接收已取消");
      const part=view.subarray(offset,Math.min(view.length,offset+WEB_CHUNK_BYTES));
      const status=await nativeWebReceiver.append(ticket,offset,bytesToBase64(part));
      if(status.received!==offset+part.byteLength || status.total!==bytes.byteLength)
        throw new Error("本机分块接收状态异常");
    }
    if(signal?.aborted)throw new Error("接收已取消");
    const receipt=await nativeWebReceiver.finish(ticket);
    // Only a persisted native Store job may be called completed.
    if(receipt.status!=="completed" || receipt.job_id!==started.job_id ||
      receipt.bytes!==bytes.byteLength)throw new Error("本机任务未确认成功，请检查绑定目录");
    return receipt;
  }catch(error){
    if(prepared)try{await nativeWebReceiver.abort(ticket);}catch{/* The Rust stage TTL also bounds cleanup. */}
    throw error;
  }
}
