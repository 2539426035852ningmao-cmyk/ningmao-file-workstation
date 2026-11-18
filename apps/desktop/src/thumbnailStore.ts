const limit=96,maxEntry=160*1024;
let opened:Promise<IDBDatabase|null>|undefined;
function database(){
 return opened??=new Promise<IDBDatabase|null>(resolve=>{
   if(!globalThis.indexedDB){resolve(null);return;}
   const request=indexedDB.open('ningmao-thumbnail-v1',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'}).createIndex('saved','saved');
   request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
   request.onerror=request.onblocked=()=>resolve(null);
 }).catch(()=>null);
}

export async function thumbnailStoreKey(key:string){
 try{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
   return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
 }catch{return null;}
}
const valid=(value:unknown):value is string=>typeof value==='string'&&value.length<=maxEntry&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
export async function readThumbnail(id:string){
 try{
   const db=await database();if(!db)return null;
   return await new Promise<string|null>(resolve=>{
     const request=db.transaction('images').objectStore('images').get(id);
     request.onsuccess=()=>resolve(valid(request.result?.url)?request.result.url:null);
     request.onerror=()=>resolve(null);
   });
 }catch{return null;}
}
export async function saveThumbnail(id:string,url:string){
 if(!valid(url))return;
 try{
   const db=await database();if(!db)return;
   const tx=db.transaction('images','readwrite'),store=tx.objectStore('images');
   store.put({id,url,saved:Date.now()});
   const count=store.count();
   count.onsuccess=()=>{
     let excess=count.result-limit;
     if(excess<=0)return;
     const cursor=store.index('saved').openCursor();
     cursor.onsuccess=()=>{const row=cursor.result;if(row&&excess>0){row.delete();excess--;if(excess>0)row.continue();}};
   };
   await new Promise<void>(resolve=>{tx.oncomplete=tx.onabort=tx.onerror=()=>resolve();});
 }catch{}
}
