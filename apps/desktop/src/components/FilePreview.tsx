import {AudioWaveform} from "./AudioWaveform";
import {claimPlayback,observePlayback} from "../mediaPlayback";
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {X,Play,Pause,Volume2,VolumeX} from 'lucide-react';
import type {Backend,Item,PreviewFile} from '../backend';
import {Button} from './ui/button';
import {thumbnailKey} from '../thumbnails';
const DocumentPreview=lazy(()=>import('./DocumentPreview'));
const imagePreviews=new Map<string,PreviewFile>();

export function FilePreview({item,backend,onClose,placeholder}:{item:Item;backend:Backend;onClose:()=>void;placeholder?:string|null}){
 const [file,setFile]=useState<PreviewFile|null>(null),[error,setError]=useState(''),[dimensions,setDimensions]=useState('');
 const [playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[muted,setMuted]=useState(false);
 const playbackKey=useRef(crypto.randomUUID());
 useEffect(()=>observePlayback(playbackKey.current,()=>media.current?.pause()),[]);
 const media=useRef<HTMLMediaElement|null>(null),content=useRef<HTMLDivElement>(null);
 const [anchor,setAnchor]=useState<number|null>(null),[expanded,setExpanded]=useState(false);
 const pathId=useRef(crypto.randomUUID()).current;
 useEffect(()=>{
   const recenter=()=>{setAnchor(null);setExpanded(false);};
   window.addEventListener('resize',recenter);return()=>window.removeEventListener('resize',recenter);
 },[]);
 useEffect(()=>{
   let live=true,ticket:string|null=null;setFile(null);setError('');setDimensions('');setPlaying(false);setPosition(0);setDuration(0);setMuted(false);
   const key=thumbnailKey(item),cached=item.status==='normal'?imagePreviews.get(key):undefined;
   void (cached?Promise.resolve(cached):backend.previewPrepare?.(item.id)??Promise.resolve<PreviewFile>({kind:'unsupported'})).then(value=>{
     if(!live){if(value.ticket)void backend.previewRelease?.(value.ticket).catch(()=>{});return;}
     ticket=value.ticket??null;setFile(value);if(value.dimensions)setDimensions(`${value.dimensions[0]} × ${value.dimensions[1]}`);
     if(value.kind==='image'&&value.url&&!value.ticket&&value.url.length<3_000_000){
       imagePreviews.delete(key);
       if(imagePreviews.size>=4)imagePreviews.delete(imagePreviews.keys().next().value!);
       imagePreviews.set(key,value);
     }
   }).catch(e=>{if(live)setError(String(e));});
   return()=>{live=false;const player=media.current;if(player){player.pause();player.removeAttribute('src');player.load();}if(ticket)void backend.previewRelease?.(ticket).catch(()=>{});};
 },[backend,item.id,item.path,item.status,item.modified,item.thumbnail_stamp,item.bytes]);
 const failed=()=>setError('当前文件或编码暂时无法预览。');
 const toggle=()=>{const player=media.current;if(player){if(player.paused)void player.play().catch(failed);else player.pause();}};
 const time=(seconds:number)=>Number.isFinite(seconds)?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'--:--';
 const mediaEvents={onLoadedMetadata:()=>{setDuration(media.current?.duration??0);const p=media.current;if(p instanceof HTMLVideoElement)setDimensions(`${p.videoWidth} × ${p.videoHeight}`);},onDurationChange:()=>setDuration(media.current?.duration??0),onTimeUpdate:()=>setPosition(media.current?.currentTime??0),onPlay:()=>{claimPlayback(playbackKey.current);setPlaying(true);},onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),onVolumeChange:()=>setMuted(media.current?.muted??false),onError:failed};
 const playerRef=useCallback((node:HTMLMediaElement|null)=>{const previous=media.current;if(previous&&previous!==node){previous.pause();previous.removeAttribute('src');previous.load();}media.current=node;},[]);
 useEffect(()=>{
   const key=(event:KeyboardEvent)=>{
     if(event.isComposing||event.repeat)return;
     if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
     if(event.key===' '&&file?.kind==='audio'&&!(event.target instanceof Element&&event.target.closest('button,input,textarea,select,[role=slider],[contenteditable=true]'))){event.preventDefault();event.stopPropagation();content.current?.querySelector<HTMLButtonElement>('[data-audio-toggle]')?.click();return;}
     if(event.key!==' '||!media.current||event.target instanceof Element&&event.target.closest('input:not([type=range]),textarea,select,button,[contenteditable=true]'))return;
     event.preventDefault();event.stopPropagation();if(media.current.paused)void media.current.play().catch(failed);else media.current.pause();
   };
   // Capture ahead of native media controls and Radix's bubbling dismiss handler.
   window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[onClose,file?.kind]);
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal>
   <Dialog.Overlay className="shelf-menu-backdrop preview-backdrop"/>
   <Dialog.Content ref={content} tabIndex={-1} className="file-preview-dialog" style={anchor===null?undefined:{top:anchor,transform:'translateX(-50%)',maxHeight:`calc(100dvh - ${anchor+20}px)`}} aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();content.current?.focus();}}>
    <header><Dialog.Title className="sr-only">快速预览</Dialog.Title><h3 title={item.name}>{item.name}</h3><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭预览"><X size={16}/></Button></Dialog.Close></header>
    <div className="preview-scroll"><div className="preview-content" aria-busy={!file&&!error}>
      {!file&&!error&&!placeholder&&<span role="status">正在读取…</span>}
      {((file?.kind==='image'&&file.url)||(!file&&placeholder))&&<div className={placeholder?'preview-image-stage':undefined}><img alt={item.name} src={file?.url||placeholder||undefined} onError={file?failed:undefined}/></div>}
      {file?.kind==='text'&&<pre tabIndex={0} aria-label="文件内容">{file.text}</pre>}
      {file?.kind==='audio'&&file.url&&<AudioWaveform item={item} backend={backend} prepared={file}/>}
      {file?.kind==='video'&&file.url&&<video ref={playerRef} aria-label="视频预览" src={file.url} preload="metadata" playsInline {...mediaEvents}/>}
      {(file?.kind==='pdf'||file?.kind==='office')&&file.url&&<Suspense fallback={<p role="status">正在读取文档…</p>}><DocumentPreview kind={item.kind} url={file.url}/></Suspense>}
      {file?.kind==='unsupported'&&<p>此类型暂不支持内容预览。</p>}
      {file?.truncated&&<p className="muted">仅显示前 1 MiB 内容</p>}
      {error&&<p role="alert">{error}</p>}
    </div>
      {file?.kind==='video'&&file.url&&<div className="preview-player" role="group" aria-label="播放控制">
        <Button variant="ghost" size="icon" aria-label={playing?'暂停':'播放'} onClick={toggle}>{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
        <span className="preview-time" role="timer" aria-label="播放时间">{time(position)} / {duration>0?time(duration):'--:--'}</span>
        <input type="range" aria-label="播放进度" min={0} max={Number.isFinite(duration)?duration:0} step="0.1" value={position} disabled={!Number.isFinite(duration)||duration<=0} onChange={event=>{if(media.current)media.current.currentTime=Number(event.target.value);}}/>
        <Button variant="ghost" size="icon" aria-label={muted?'取消静音':'静音'} onClick={()=>{if(media.current)media.current.muted=!media.current.muted;}}>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</Button>
      </div>}
    <div className="preview-summary"><span>{item.kind.toUpperCase()}</span><span>{item.bytes>=1048576?`${(item.bytes/1048576).toFixed(1)} MB`:`${Math.ceil(item.bytes/1024)} KB`}</span>{item.tags.length>0&&item.tags.length<=3&&<span>{item.tags.join("、")}</span>}{dimensions&&<span>{dimensions} px</span>}{duration>0&&<span>{time(duration)}</span>}</div>
    <div className="preview-path"><button type="button" className="preview-path-toggle" aria-expanded={expanded} aria-controls={pathId} onClick={()=>{if(anchor===null&&content.current)setAnchor(content.current.getBoundingClientRect().top);setExpanded(value=>!value);}}><span aria-hidden="true">▸</span> 原始位置</button><div className="preview-path-reveal" data-expanded={expanded} id={pathId} inert={!expanded}><div><p>{item.path.replace(/^\\\\\?\\UNC\\/i,'\\\\').replace(/^\\\\\?\\/,'')}</p>{item.tags.length>3&&<p>{item.tags.join("、")}</p>}</div></div></div></div>
   </Dialog.Content>
 </Dialog.Portal></Dialog.Root>;
}
