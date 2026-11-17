import type {Backend,Item} from './backend';

const cache=new Map<string,string|null>();
let tail=Promise.resolve();
export const images=['png','jpg','jpeg','webp'];
export const videos=['mp4','m4v','webm','ogv','mov'];
export const documents=['pdf','docx','pptx','xlsx'];
const key=(item:Item)=>JSON.stringify([item.id,item.path,item.modified,item.bytes]);
export const cachedThumbnail=(item:Item)=>item.status==='normal'?cache.get(key(item)):null;
export function queueThumbnail(backend:Backend,item:Item,signal:AbortSignal){
 const run=tail.then(async()=>{
   if(signal.aborted)return null;
   const id=key(item);
   if(cache.has(id))return cache.get(id)??null;
   const value=await backend.thumbnail(item.id).catch(()=>null)
     ||(videos.includes(item.kind)?await videoPoster(backend,item.id,signal):null);
   if(!signal.aborted){
     if(cache.size>=128)cache.delete(cache.keys().next().value!);
     cache.set(id,value);
   }
   return value;
 });
 tail=run.then(()=>{},()=>{});
 return run;
}

async function videoPoster(backend:Backend,id:number,signal:AbortSignal):Promise<string|null>{
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
     const timer=setTimeout(cancel,2200);
     let seek=false;
     const capture=()=>{
       if(!player.videoWidth||!player.videoHeight||player.seeking||player.readyState<2)return;
       try{
         const canvas=document.createElement('canvas'),scale=Math.min(1,320/Math.max(player.videoWidth,player.videoHeight));
         canvas.width=Math.max(1,Math.round(player.videoWidth*scale));canvas.height=Math.max(1,Math.round(player.videoHeight*scale));
         const context=canvas.getContext('2d');
         if(!context)return cancel();
         context.drawImage(player,0,0,canvas.width,canvas.height);
         finish(canvas.toDataURL('image/jpeg',.8));
       }catch{cancel();}
     };
     signal.addEventListener('abort',cancel,{once:true});
     player.onerror=cancel;
     player.onloadedmetadata=()=>{if(Number.isFinite(player.duration)&&player.duration>0.3){seek=true;player.currentTime=Math.min(2,player.duration*.15);}};
     player.onloadeddata=()=>{if(!seek)capture();};
     player.onseeked=capture;
     player.crossOrigin='anonymous';player.src=file.url!;
   });
 }finally{
   player.removeAttribute('src');player.load();
   if(file.ticket)void backend.previewRelease?.(file.ticket).catch(()=>{});
 }
}
