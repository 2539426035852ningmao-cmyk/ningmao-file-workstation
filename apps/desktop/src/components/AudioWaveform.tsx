import {useCallback,useEffect,useRef,useState} from 'react';
import {Pause,Play,Volume2,VolumeX} from 'lucide-react';
import type {Backend,Item,PreviewFile,Waveform} from '../backend';
import {claimPlayback,observePlayback,ownsPlayback} from '../mediaPlayback';
import {thumbnailKey} from '../thumbnails';
const cache=new Map<string,Waveform>();
let queue=Promise.resolve();
const time=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
export function AudioWaveform({item,backend,prepared,compact=false,onActivate}:{item:Item;backend:Backend;prepared?:PreviewFile;compact?:boolean;onActivate?:()=>void}){
 const host=useRef<HTMLDivElement>(null),player=useRef<HTMLAudioElement|null>(null),key=useRef(crypto.randomUUID());
 const playerRef=useCallback((node:HTMLAudioElement|null)=>{const previous=player.current;if(previous&&previous!==node){previous.pause();previous.removeAttribute("src");previous.load();}player.current=node;},[]);
 const ownedTicket=useRef<string|null>(null),generation=useRef(0),positionRef=useRef(0);
 const [wave,setWave]=useState<Waveform|null>(null),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[muted,setMuted]=useState(false);
 const cacheKey=thumbnailKey(item);
 const stop=useCallback(()=>{generation.current++;const p=player.current;if(p){positionRef.current=p.currentTime||positionRef.current;p.pause();if(!prepared){p.removeAttribute('src');p.load();}}if(ownedTicket.current){void backend.previewRelease?.(ownedTicket.current).catch(()=>{});ownedTicket.current=null;}setPlaying(false);},[backend,prepared]);
 useEffect(()=>observePlayback(key.current,stop),[stop]);
 useEffect(()=>()=>stop(),[stop]);
 useEffect(()=>{
   stop();positionRef.current=0;setPosition(0);setDuration(0);setWave(null);setError("");
   let live=true,requested=false;
   const load=()=>{if(requested)return;requested=true;const found=cache.get(cacheKey);if(found){setWave(found);return;}
     queue=queue.catch(()=>{}).then(async()=>{if(!live)return;if(!backend.waveformPrepare){if(live)setError('波形暂不可用');return;}try{const result=await backend.waveformPrepare(item.id);if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(cacheKey,result);if(live)setWave(result);}catch(e){if(live)setError(String(e));}});
   };
   if(!compact)load();
   const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load();});if(host.current)observer.observe(host.current);
   return()=>{live=false;observer.disconnect();};
 },[backend,cacheKey,compact,item.id,stop]);
 async function play(at?:number){
   const p=player.current;if(!p)return;
   if(at===undefined&&!p.paused){generation.current++;p.pause();return;}
   onActivate?.();claimPlayback(key.current);const request=++generation.current;
   if(at!==undefined)positionRef.current=Math.max(0,at);
   try{
     if(!p.getAttribute('src')){const file=prepared??await backend.previewPrepare?.(item.id);if(!file?.url||file.kind!=='audio')throw new Error('此音频暂时无法播放');if(request!==generation.current||!ownsPlayback(key.current)){if(!prepared&&file.ticket)void backend.previewRelease?.(file.ticket);return;}if(!prepared)ownedTicket.current=file.ticket??null;p.src=file.url;}
     if(request!==generation.current||!ownsPlayback(key.current))return;
     if(p.readyState>=1)p.currentTime=Math.min(positionRef.current,Number.isFinite(p.duration)?p.duration:positionRef.current);
     await p.play();
   }catch(e){if(request===generation.current&&ownsPlayback(key.current)){setError(String(e));stop();}}
 }
 const total=duration||wave?.duration||0,ratio=total?Math.max(0,Math.min(1,position/total)):0;
 const peaks=wave?.peaks??[],bars=Array.from({length:Math.min(128,peaks.length)},(_,i)=>{const start=Math.floor(i*peaks.length/Math.min(128,peaks.length)),end=Math.max(start+1,Math.floor((i+1)*peaks.length/Math.min(128,peaks.length)));return Math.max(...peaks.slice(start,end));});
 const maximum=Math.max(.001,...bars);
 const path=bars.map((p,i)=>{const h=Math.max(.5,Math.sqrt(p/maximum)*20);return `M${i+.5},${24-h}v${h*2}`;}).join(' ');
 return <div ref={host} className={`audio-waveform${compact?' audio-waveform-compact':''}`} data-no-window-drag onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
   <audio ref={playerRef} src={prepared?.url??undefined} preload="metadata" aria-label={`音频试听 ${item.name}`} onLoadedMetadata={()=>{const p=player.current;if(p){setDuration(Number.isFinite(p.duration)?p.duration:0);p.currentTime=Math.min(positionRef.current,Number.isFinite(p.duration)?p.duration:positionRef.current);}}} onPlay={()=>{if(!ownsPlayback(key.current)){player.current?.pause();return;}setPlaying(!!player.current&&!player.current.paused);}} onPause={()=>setPlaying(!!player.current&&!player.current.paused)} onEnded={()=>setPlaying(!!player.current&&!player.current.paused)} onTimeUpdate={()=>{const n=player.current?.currentTime??0;positionRef.current=n;setPosition(n);}} onError={()=>{if(player.current?.getAttribute('src'))setError('当前音频无法播放');}}/>
   <button type="button" data-audio-toggle aria-label={playing?`暂停 ${item.name}`:`播放 ${item.name}`} onClick={()=>void play()}>{playing?<Pause size={16}/>:<Play size={16}/>}</button>
   <div className="audio-wave-track" role="slider" tabIndex={0} aria-label={`试听进度 ${item.name}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={position} aria-valuetext={`${time(position)} / ${time(total)}`} title={error||undefined} onClick={e=>{if(total){const rect=e.currentTarget.getBoundingClientRect();void play(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*total);}}} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();void play();}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();void play(Math.max(0,Math.min(total,positionRef.current+(e.key==='ArrowRight'?5:-5))));}}}>
     {wave?<svg viewBox={`0 0 ${Math.max(1,bars.length)} 48`} preserveAspectRatio="none" aria-hidden="true"><path d={path} className="audio-wave-base"/><path d={path} className="audio-wave-played" style={{clipPath:`inset(0 ${100-ratio*100}% 0 0)`}}/></svg>:<span className="audio-wave-loading" aria-hidden="true"/>}
   </div>
   {!compact&&<span className="audio-wave-time">{time(position)} / {time(total)}</span>}
   {!compact&&<button type="button" aria-label={muted?'取消静音':'静音'} onClick={()=>{if(player.current){player.current.muted=!player.current.muted;setMuted(player.current.muted);}}}>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</button>}
   {!compact&&error&&<p role="alert" className="audio-wave-error">{error}</p>}
 </div>;
}
