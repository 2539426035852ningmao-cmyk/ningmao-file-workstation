import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Dialog} from 'radix-ui';
import {X} from 'lucide-react';
import type {Backend,Item,PreviewFile} from '../backend';
import {Button} from './ui/button';

export function FilePreview({item,backend,onClose,information}:{item:Item;backend:Backend;onClose:()=>void;information:ReactNode}){
 const [file,setFile]=useState<PreviewFile|null>(null),[error,setError]=useState('');
 const media=useRef<HTMLMediaElement|null>(null),content=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   let live=true,ticket:string|null=null;setFile(null);setError('');
   void (backend.previewPrepare?.(item.id)??Promise.resolve<PreviewFile>({kind:'unsupported'})).then(value=>{
     if(!live){if(value.ticket)void backend.previewRelease?.(value.ticket).catch(()=>{});return;}
     ticket=value.ticket??null;setFile(value);
   }).catch(e=>{if(live)setError(String(e));});
   return()=>{live=false;const player=media.current;if(player){player.pause();player.removeAttribute('src');player.load();}if(ticket)void backend.previewRelease?.(ticket).catch(()=>{});};
 },[backend,item.id,item.path,item.status]);
 const failed=()=>setError('当前文件或编码无法预览，可用默认程序打开。');
 const playerRef=useCallback((node:HTMLMediaElement|null)=>{const previous=media.current;if(previous&&previous!==node){previous.pause();previous.removeAttribute('src');previous.load();}media.current=node;},[]);
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal>
   <Dialog.Overlay className="shelf-menu-backdrop preview-backdrop"/>
   <Dialog.Content ref={content} tabIndex={-1} className="file-preview-dialog" aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();content.current?.focus();}} onKeyDownCapture={event=>{
     if(event.key!==' '||event.nativeEvent.isComposing||event.repeat||!media.current||event.target instanceof Element&&event.target.closest('input,textarea,select,button,[contenteditable=true]'))return;
     event.preventDefault();event.stopPropagation();if(media.current.paused)void media.current.play().catch(failed);else media.current.pause();
   }}>
    <header><Dialog.Title>快速预览</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭预览"><X size={16}/></Button></Dialog.Close></header>
    <div className="preview-scroll"><h3 title={item.name}>{item.name}</h3><div className="preview-content" aria-busy={!file&&!error}>
      {!file&&!error&&<span role="status">正在读取…</span>}
      {file?.kind==='image'&&file.url&&<img alt={item.name} src={file.url} onError={failed}/>}
      {file?.kind==='text'&&<pre tabIndex={0} aria-label="文件内容">{file.text}</pre>}
      {file?.kind==='audio'&&file.url&&<audio ref={playerRef} aria-label="音频预览" src={file.url} controls preload="metadata" onError={failed}/>}
      {file?.kind==='video'&&file.url&&<video ref={playerRef} aria-label="视频预览" src={file.url} controls preload="metadata" playsInline onError={failed}/>}
      {file?.kind==='unsupported'&&<p>此类型暂不支持内容预览。</p>}
      {file?.truncated&&<p className="muted">仅显示前 1 MiB 内容</p>}
      {error&&<p role="alert">{error}</p>}
    </div><Button variant="outline" onClick={()=>void backend.open(item.id).catch(e=>setError(String(e)))}>用默认程序打开</Button>
    <details className="preview-information" open={file?.kind==='unsupported'||!!error}><summary>文件信息</summary>{information}</details></div>
   </Dialog.Content>
 </Dialog.Portal></Dialog.Root>;
}
