import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Dialog} from 'radix-ui';
import {X,Play,Pause,Volume2,VolumeX} from 'lucide-react';
import type {Backend,Item,PreviewFile} from '../backend';
import {Button} from './ui/button';

export function FilePreview({item,backend,onClose,information}:{item:Item;backend:Backend;onClose:()=>void;information:ReactNode}){
 const [file,setFile]=useState<PreviewFile|null>(null),[error,setError]=useState('');
 const [playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[muted,setMuted]=useState(false);
 const media=useRef<HTMLMediaElement|null>(null),content=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   let live=true,ticket:string|null=null;setFile(null);setError('');setPlaying(false);setPosition(0);setDuration(0);setMuted(false);
   void (backend.previewPrepare?.(item.id)??Promise.resolve<PreviewFile>({kind:'unsupported'})).then(value=>{
     if(!live){if(value.ticket)void backend.previewRelease?.(value.ticket).catch(()=>{});return;}
     ticket=value.ticket??null;setFile(value);
   }).catch(e=>{if(live)setError(String(e));});
   return()=>{live=false;const player=media.current;if(player){player.pause();player.removeAttribute('src');player.load();}if(ticket)void backend.previewRelease?.(ticket).catch(()=>{});};
 },[backend,item.id,item.path,item.status]);
 const failed=()=>setError('当前文件或编码无法预览，可用默认程序打开。');
 const toggle=()=>{const player=media.current;if(player){if(player.paused)void player.play().catch(failed);else player.pause();}};
 const time=(seconds:number)=>Number.isFinite(seconds)?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'--:--';
 const mediaEvents={onLoadedMetadata:()=>setDuration(media.current?.duration??0),onDurationChange:()=>setDuration(media.current?.duration??0),onTimeUpdate:()=>setPosition(media.current?.currentTime??0),onPlay:()=>setPlaying(true),onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),onVolumeChange:()=>setMuted(media.current?.muted??false),onError:failed};
 const playerRef=useCallback((node:HTMLMediaElement|null)=>{const previous=media.current;if(previous&&previous!==node){previous.pause();previous.removeAttribute('src');previous.load();}media.current=node;},[]);
 useEffect(()=>{
   const key=(event:KeyboardEvent)=>{
     if(event.isComposing||event.repeat)return;
     if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
     if(event.key!==' '||!media.current||event.target instanceof Element&&event.target.closest('input:not([type=range]),textarea,select,button,[contenteditable=true]'))return;
     event.preventDefault();event.stopPropagation();if(media.current.paused)void media.current.play().catch(failed);else media.current.pause();
   };
   // Capture ahead of native media controls and Radix's bubbling dismiss handler.
   window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[onClose]);
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal>
   <Dialog.Overlay className="shelf-menu-backdrop preview-backdrop"/>
   <Dialog.Content ref={content} tabIndex={-1} className="file-preview-dialog" aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();content.current?.focus();}}>
    <header><Dialog.Title>快速预览</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭预览"><X size={16}/></Button></Dialog.Close></header>
    <div className="preview-scroll"><h3 title={item.name}>{item.name}</h3><div className="preview-content" aria-busy={!file&&!error}>
      {!file&&!error&&<span role="status">正在读取…</span>}
      {file?.kind==='image'&&file.url&&<img alt={item.name} src={file.url} onError={failed}/>}
      {file?.kind==='text'&&<pre tabIndex={0} aria-label="文件内容">{file.text}</pre>}
      {file?.kind==='audio'&&file.url&&<audio ref={playerRef} aria-label="音频预览" src={file.url} preload="metadata" {...mediaEvents}/>}
      {file?.kind==='video'&&file.url&&<video ref={playerRef} aria-label="视频预览" src={file.url} preload="metadata" playsInline {...mediaEvents}/>}
      {(file?.kind==='audio'||file?.kind==='video')&&file.url&&<div className="preview-player" role="group" aria-label="播放控制">
        <Button variant="ghost" size="icon" aria-label={playing?'暂停':'播放'} onClick={toggle}>{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
        <span className="preview-time" role="timer" aria-label="播放时间">{time(position)} / {duration>0?time(duration):'--:--'}</span>
        <input type="range" aria-label="播放进度" min={0} max={Number.isFinite(duration)?duration:0} step="0.1" value={position} disabled={!Number.isFinite(duration)||duration<=0} onChange={event=>{if(media.current)media.current.currentTime=Number(event.target.value);}}/>
        <Button variant="ghost" size="icon" aria-label={muted?'取消静音':'静音'} onClick={()=>{if(media.current)media.current.muted=!media.current.muted;}}>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</Button>
      </div>}
      {file?.kind==='unsupported'&&<p>此类型暂不支持内容预览。</p>}
      {file?.truncated&&<p className="muted">仅显示前 1 MiB 内容</p>}
      {error&&<p role="alert">{error}</p>}
    </div><Button variant="outline" onClick={()=>void backend.open(item.id).catch(e=>setError(String(e)))}>用默认程序打开</Button>
    <details className="preview-information" open={file?.kind==='unsupported'||!!error}><summary>文件信息</summary>{information}</details></div>
   </Dialog.Content>
 </Dialog.Portal></Dialog.Root>;
}
