const limit=96,maxEntry=160*1024;
type StoreName='images'|'waveforms';
const databases=new Map<StoreName,Promise<IDBDatabase|null>>();
function database(name:StoreName){
 const opened=databases.get(name);
 if(opened)return opened;
 const opening=new Promise<IDBDatabase|null>(resolve=>{
   if(!globalThis.indexedDB){resolve(null);return;}
   const request=indexedDB.open(name==='images'?'ningmao-thumbnail-v1':'ningmao-waveform-v1',1);
   request.onupgradeneeded=()=>request.result.createObjectStore(name,{keyPath:'id'}).createIndex('saved','saved');
   request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
   request.onerror=request.onblocked=()=>resolve(null);
 }).catch(()=>null);
 databases.set(name,opening);
 return opening;
}

export async function thumbnailStoreKey(key:string){
 try{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
   return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
 }catch{return null;}
}
const valid=(value:unknown):value is string=>typeof value==='string'&&value.length<=maxEntry&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
async function read(name:StoreName,id:string){
 try{
   const db=await database(name);if(!db)return null;
   return await new Promise<unknown>(resolve=>{
     const request=db.transaction(name).objectStore(name).get(id);
     request.onsuccess=()=>resolve(request.result?.value??request.result?.url??null);
     request.onerror=()=>resolve(null);
   });
 }catch{return null;}
}
async function save(name:StoreName,id:string,value:unknown,capacity:number){
 try{
   const db=await database(name);if(!db)return;
   const tx=db.transaction(name,'readwrite'),store=tx.objectStore(name);
   store.put(name==='images'?{id,url:value,saved:Date.now()}:{id,value,saved:Date.now()});
   const count=store.count();
   count.onsuccess=()=>{
     let excess=count.result-capacity;
     if(excess<=0)return;
     const cursor=store.index('saved').openCursor();
     cursor.onsuccess=()=>{const row=cursor.result;if(row&&excess>0){row.delete();excess--;if(excess>0)row.continue();}};
   };
   await new Promise<void>(resolve=>{tx.oncomplete=tx.onabort=tx.onerror=()=>resolve();});
 }catch{}
}
export async function readThumbnail(id:string){
 const value=await read('images',id);
 return valid(value)?value:null;
}
export async function saveThumbnail(id:string,url:string){
 if(valid(url))await save('images',id,url,limit);
}
export async function readWaveform(id:string){
 const value=await read('waveforms',id) as {duration?:number;peaks?:Float32Array}|null;
 if(!value||typeof value.duration!=='number'||!Number.isFinite(value.duration)||value.duration<=0||value.duration>7200||
   !(value.peaks instanceof Float32Array)||!value.peaks.length||value.peaks.length>256||
   !value.peaks.every(peak=>Number.isFinite(peak)&&peak>=0&&peak<=1))return null;
 return {duration:value.duration,peaks:Array.from(value.peaks)};
}
export async function saveWaveform(id:string,value:{duration:number;peaks:number[]}){
 if(value.peaks.length>0&&value.peaks.length<=256&&value.duration>0&&value.duration<=7200){
   await save('waveforms',id,{duration:value.duration,peaks:Float32Array.from(value.peaks)},512);
 }
}
