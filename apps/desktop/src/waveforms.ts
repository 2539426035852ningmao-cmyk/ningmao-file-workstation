import type {Backend,Item,Waveform} from './backend';
import {mediaQueue} from './mediaQueue';
import {readWaveform,saveWaveform,thumbnailStoreKey} from './thumbnailStore';
import {thumbnailKey} from './thumbnails';

const memory=new Map<string,Waveform>(),enqueue=mediaQueue(32);
export async function loadWaveform(backend:Backend,item:Item,signal:AbortSignal,priority:()=>number){
 const key=thumbnailKey(item);
 const cached=memory.get(key);
 if(cached)return cached;
 const id=item.thumbnail_stamp?await thumbnailStoreKey('waveform-1:'+key):null;
 const disk=id?await readWaveform(id):null;
 if(disk){remember(key,disk);return disk;}
 return enqueue(priority,signal,async()=>{
   if(signal.aborted||document.hidden)return null;
   const cached=memory.get(key);
   if(cached)return cached;
   if(!backend.waveformPrepare)throw Error('波形暂不可用');
   const value=await backend.waveformPrepare(item.id);
   const wave={duration:value.duration,peaks:reducePeaks(value.peaks,256)};
   remember(key,wave);
   if(id)await saveWaveform(id,wave);
   return wave;
 });
}
function remember(key:string,value:Waveform){
 if(memory.size>=64&&!memory.has(key))memory.delete(memory.keys().next().value!);
 memory.set(key,value);
}
export function reducePeaks(peaks:number[],limit:number){
 const length=Math.min(peaks.length,limit);
 return Array.from({length},(_,index)=>{
   const start=Math.floor(index*peaks.length/length),end=Math.floor((index+1)*peaks.length/length);
   let maximum=0;
   for(let sample=start;sample<end;sample++)maximum=Math.max(maximum,peaks[sample]);
   return maximum;
 });
}
