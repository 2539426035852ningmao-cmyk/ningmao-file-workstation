import type {Backend,Item} from './backend';

const cache=new Map<string,string|null>();
let thumbnailTail=Promise.resolve(),posterTail=Promise.resolve();
export const images=['png','jpg','jpeg','webp'];
export const videos=['mp4','m4v','webm','ogv','mov'];
export const documents=['pdf','docx','pptx','xlsx'];
export const thumbnailKinds=new Set([...images,...videos,...documents]);
const key=(item:Item)=>JSON.stringify([item.id,item.path,item.modified,item.bytes]);
export const cachedThumbnail=(item:Item)=>item.status==='normal'?cache.get(key(item)):null;
export async function queueThumbnail(backend:Backend,item:Item,signal:AbortSignal){
 const id=key(item),video=videos.includes(item.kind);
 const system=thumbnailTail.then(async()=>{
   if(signal.aborted)return null;
   if(cache.has(id))return cache.get(id)??null;
   return backend.thumbnail(item.id).catch(()=>null);
 });
 thumbnailTail=system.then(()=>{},()=>{});
 const remember=(value:string|null)=>{
   if(!signal.aborted&&(value||!video)){
     if(cache.size>=128&&!cache.has(id))cache.delete(cache.keys().next().value!);
     cache.set(id,value);
   }
   return value;
 };
 const result=await system;
 if(result||!video||signal.aborted)return remember(result);
 const enqueue=(firstFrame:boolean)=>{
   const run=posterTail.then(async()=>signal.aborted?null:cache.get(id)??remember(await videoPoster(backend,item.id,signal,firstFrame)));
   posterTail=run.then(()=>{},()=>{});
   return run;
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
