import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {nativeWebTransferSource} from "./webTransferBackend";

export type PendingTransfer={id:string;alias:string;files:{name:string;size:number}[];total:number};
export type TransferView={receiving:boolean;address:string|null;fingerprint:string|null;shelf_id:number|null;pending:PendingTransfer|null;sending:boolean};
export type TransferProgress={job_id:number;phase:string;file_index:number;file_count:number;file_bytes:number;file_total:number;bytes:number;total:number};
export type TransferResult={job_id:number;status:string;message:string;files:{index:number;status:string;bytes:number}[]};
export type NearbyDevice={name:string;address:string;fingerprint:string};
export type WebSourceInfo={item_id:number;name:string;bytes:number;sha256:string};
export interface TransferBackend{
  devices?():Promise<NearbyDevice[]>;
  peers?():Promise<{name:string;fingerprint:string}[]>;
  pair?(name:string,address:string,fingerprint:string):Promise<void>;
  browserAvailable?():Promise<boolean>;
  webSourceInfo?(shelf:number,item:number):Promise<WebSourceInfo>;
  browserSend?(shelf:number,ids:number[],code:string):Promise<{job_id:number;status:string}>;
  browserCancel?():Promise<void>;
  view():Promise<TransferView>;
  receive(shelf:number,address:string):Promise<void>;
  stopReceive():Promise<void>;
  decide(id:string,accept:boolean):Promise<void>;
  send(shelf:number,ids:number[],address:string,fingerprint:string):Promise<TransferResult>;
  cancelSend():Promise<void>;
  subscribe(events:{changed:()=>void;progress:(value:TransferProgress)=>void}):Promise<()=>void>;
}
export const nativeTransfer:TransferBackend={
  devices:()=>invoke("transfer_devices"),
  peers:()=>invoke("transfer_peers"),
  pair:(name,address,fingerprint)=>invoke("transfer_pair",{name,address,fingerprint}),
  browserAvailable:()=>invoke("browser_share_available"),
  async webSourceInfo(shelf,item){
    const prepared=await nativeWebTransferSource.prepare(shelf,item);
    try{return {item_id:prepared.item_id,name:prepared.name,bytes:prepared.bytes,sha256:prepared.sha256};}
    finally{await nativeWebTransferSource.release(prepared.ticket);}
  },
  browserSend:(shelfId,ids,code)=>invoke("browser_share_send",{shelfId,ids,code}),
  browserCancel:()=>invoke("browser_share_cancel"),
  view:()=>invoke("transfer_view"),
  receive:(shelfId,bindAddress)=>invoke("transfer_receive",{shelfId,bindAddress}),
  stopReceive:()=>invoke("transfer_stop_receive"),
  decide:(id,accept)=>invoke("transfer_decide",{id,accept}),
  send:(shelfId,ids,address,fingerprint)=>invoke("transfer_send",{shelfId,ids,address,fingerprint}),
  cancelSend:()=>invoke("transfer_cancel_send"),
  async subscribe(events){
    const cleanups:(()=>void)[]=[];
    try{
      cleanups.push(await listen("transfer-changed",events.changed));
      cleanups.push(await listen<TransferProgress>("transfer-progress",event=>events.progress(event.payload)));
      return()=>cleanups.forEach(fn=>fn());
    }catch(error){cleanups.forEach(fn=>fn());throw error;}
  },
};
