import {useEffect, useRef, useState} from "react";
import {FileText, ShieldCheck, X} from "lucide-react";
import {classifyFile, formatBytes} from "./file-utils.mjs";

const TEXT_SUFFIX = /\.(txt|md|markdown|json|csv|tsv|srt|vtt|log|yaml|yml|xml|ini|css|js|ts)$/i;
const TEXT_LIMIT = 32 * 1024;
type Props = {file: File; onClose: () => void};
export function LocalFilePreview({file,onClose}:Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [src,setSrc] = useState<string|null>(null);
  const [text,setText] = useState<string|null>(null);
  const [error,setError] = useState("");
  const kind = classifyFile(file.name);
  const safeMedia = (kind === "image" && !/\.svg$/i.test(file.name)) ||
    kind === "video" || kind === "audio";
  const textFile = TEXT_SUFFIX.test(file.name) || file.type.startsWith("text/");
  useEffect(() => {
    // StrictMode replays effects in development; do not call close() from
    // effect cleanup because its queued close event could dismiss a new modal.
    const node = ref.current;
    if (node && !node.open) node.showModal();
  },[]);
  useEffect(() => {
    let live = true;
    setSrc(null); setText(null); setError("");
    const url = safeMedia ? URL.createObjectURL(file) : null;
    if (url) setSrc(url);
    if (textFile) {
      void file.slice(0,TEXT_LIMIT).text()
        .then(value => {if (live) setText(value);})
        .catch(() => {if (live) setError("无法读取文本预览");});
    }
    return () => {live = false; if (url) URL.revokeObjectURL(url);};
  },[file, safeMedia, textFile]);
  return <dialog ref={ref} className="local-preview" aria-labelledby="local-preview-title" onClose={onClose}>
    <div className="preview-heading">
      <div><span className="preview-kicker">仅本机预览</span><h2 id="local-preview-title" title={file.name}>{file.name}</h2><p>{formatBytes(file.size)} · {kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : kind === "archive" ? "压缩包" : "文档"}</p></div>
      <button type="button" className="icon-button" aria-label="关闭文件预览" onClick={() => ref.current?.close()}><X size={18}/></button>
    </div>
    <div className="preview-content">
      {src && kind === "image" && <img src={src} alt={file.name}/>}
      {src && kind === "video" && <video src={src} controls preload="metadata" aria-label={file.name}/>}
      {src && kind === "audio" && <audio src={src} controls preload="metadata" aria-label={file.name}/>}
      {textFile && <div className="text-preview">{text === null && !error ? "正在读取本机文本…" : <pre>{text}</pre>}{file.size > TEXT_LIMIT && <small>为了保持流畅，仅显示前 32 KB 内容</small>}</div>}
      {!safeMedia && !textFile && <div className="preview-no-content"><FileText size={30}/><strong>此格式暂不提供内容预览</strong><span>文件仍保留在待发送列表中；未读取或上传文件内容。</span></div>}
      {error && <p role="alert" className="queue-warning">{error}</p>}
    </div>
    <footer className="preview-footer"><span><ShieldCheck size={16}/> 本地临时访问 · 关闭时释放预览资源</span><button type="button" className="secondary-button" onClick={() => ref.current?.close()}>关闭预览</button></footer>
  </dialog>;
}
