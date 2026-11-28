import type {Backend,Item} from './backend';
import {readThumbnail,saveThumbnail,thumbnailStoreKey} from './thumbnailStore';
import {mediaQueue} from './mediaQueue';

const cache=new Map<string,string|null>();
const queueImage=mediaQueue(),queuePoster=mediaQueue();
export const images=['png','jpg','jpeg','webp'];
export const videos=['mp4','m4v','webm','ogv','mov'];
export const documents=['pdf','docx','pptx','xlsx'];
export const thumbnailKinds=new Set([...images,...videos,...documents]);
export const thumbnailKey=(item:Item)=>JSON.stringify([item.id,item.path,item.thumbnail_stamp??item.modified,item.bytes]);
let visibleRequests=0;
export const mayPrefetch=()=>visibleRequests===0&&!document.hidden;
export const cachedThumbnail=(item:Item)=>item.status==='normal'?cache.get(key(item)):null;
const key=thumbnailKey;
export async function readCachedThumbnail(item:Item){
 if(item.status!=='normal')return null;
 const cached=cachedThumbnail(item);
 if(cached)return cached;
 const id=item.thumbnail_stamp?await thumbnailStoreKey(key(item)):null;
 return id?readThumbnail(id):null;
}
export async function queueThumbnail(backend:Backend,item:Item,signal:AbortSignal,prefetch=false,priority=()=>0){
 if(prefetch&&!mayPrefetch())return null;
 if(!prefetch)visibleRequests++;
 try{return await loadThumbnail(backend,item,signal,prefetch,()=>prefetch?-1:priority());}
 finally{if(!prefetch)visibleRequests--;}
}
async function loadThumbnail(backend:Backend,item:Item,signal:AbortSignal,prefetch:boolean,priority:()=>number){
 const id=key(item),video=videos.includes(item.kind);
 if(cache.has(id))return cache.get(id)??null;
 const persistent=item.thumbnail_stamp&&(video||images.includes(item.kind))?await thumbnailStoreKey(id):null;
 const remember=(value:string|null)=>{
   if(!signal.aborted&&(value||!video)){
     if(cache.size>=128&&!cache.has(id))cache.delete(cache.keys().next().value!);
     cache.set(id,value);
   }
   return value;
 };
 if(persistent){
   const cached=await readThumbnail(persistent);
   if(cached)return remember(cached);
 }
 const result=await queueImage(priority,signal,async()=>{
   if(signal.aborted||prefetch&&!mayPrefetch())return null;
   if(cache.has(id))return cache.get(id)??null;
   const url=await backend.thumbnail(item.id).catch(()=>null);
   if(url){remember(url);if(persistent&&!signal.aborted)void saveThumbnail(persistent,url);}
   return url;
 });
 if(result||!video||signal.aborted)return prefetch?result:remember(result);
 const enqueue=(firstFrame:boolean)=>{
   return queuePoster(priority,signal,async()=>{
     if(signal.aborted)return null;
     const cached=cache.get(id);
     if(cached)return cached;
     const poster=remember(await videoPoster(backend,item.id,signal,firstFrame));
     if(poster&&persistent&&!signal.aborted)void saveThumbnail(persistent,poster);
     return poster;
   });
 };
 const poster=await enqueue(false);
 return poster??(signal.aborted?null:await enqueue(true));
}

async function videoPoster(backend:Backend,id:number,signal:AbortSignal,firstFrame:boolean):Promise<string|null>{
 if(signal.aborted)return null;
 const file=await backend.previewPrepare?.(id).catch(()=>null);
 if(!file)return null;
 const player=document.createElement('video');
 try{
   if(!file.url||file.kind!=='video'||signal.aborted)return null;
   player.muted=true;player.preload='auto';
   return await new Promise(resolve=>{
     let done=false;
     const finish=(value:string|null)=>{
       if(done)return;
       done=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);
       player.onloadedmetadata=null;player.onloadeddata=null;player.onseeked=null;player.onerror=null;
       resolve(value);
     };
     const cancel=()=>finish(null);
     let fallback:string|null=null;
     const timer=setTimeout(()=>finish(fallback),firstFrame?4500:2200);
     let seek=false;
     const capture=():string|null=>{
       if(!player.videoWidth||!player.videoHeight||player.seeking||player.readyState<2)return null;
       try{
         const canvas=document.createElement('canvas'),scale=Math.min(1,320/Math.max(player.videoWidth,player.videoHeight));
         canvas.width=Math.max(1,Math.round(player.videoWidth*scale));canvas.height=Math.max(1,Math.round(player.videoHeight*scale));
         const context=canvas.getContext('2d');
         if(!context)return null;
         context.drawImage(player,0,0,canvas.width,canvas.height);
         return canvas.toDataURL('image/jpeg',.8);
       }catch{return null;}
     };
     signal.addEventListener('abort',cancel,{once:true});
     player.onerror=()=>finish(fallback);
     player.onloadeddata=()=>{
       if(seek)return;
       fallback=capture();
       if(!firstFrame&&Number.isFinite(player.duration)&&player.duration>0.3){
         seek=true;
         try{player.currentTime=Math.min(2,player.duration*.15);}catch{finish(fallback);}
       }else finish(fallback);
     };
     player.onseeked=()=>finish(capture()??fallback);
     player.crossOrigin='anonymous';player.src=file.url!;
   });
 }finally{
   player.removeAttribute('src');player.load();
   if(file.ticket)void backend.previewRelease?.(file.ticket).catch(()=>{});
 }
}
