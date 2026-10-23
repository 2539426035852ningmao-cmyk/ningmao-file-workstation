import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./App.css";

const current = getCurrentWebviewWindow();

export default function App() {
  const [files, setFiles] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [order, setOrder] = useState(["Alpha", "Beta", "Gamma"]);
  const [topmost, setTopmost] = useState(false);
  const log = (kind: string, detail: string) => {
    setEvents(previous => [`${kind}: ${detail}`, ...previous].slice(0, 12));
    void invoke("record_event", { kind, detail }).catch(console.error);
  };
  const action = async (command: string) => {
    try { const result = await invoke(command); log(command, JSON.stringify(result)); return result; }
    catch (error) { log("error", String(error)); }
  };
  const openFolder = (kind: string) => void invoke("open_probe_folder", { kind }).catch(error => log("error", String(error)));
  useEffect(() => {
    void invoke<string[]>("fixture_list").then(setFiles).catch(console.error);
    void invoke<{ topmost: boolean }>("probe_info").then(info => { setTopmost(info.topmost); log("ready", JSON.stringify(info)); }).catch(console.error);
    const drop = current.onDragDropEvent(event => {
      if (event.payload.type === "drop") {
        log("native-drop", event.payload.paths.map(path => path.split(/[\\/]/).pop()).join(", "));
      }
    });
    const result = current.listen<string>("probe-drag-result", event => log("native-result", event.payload));
    const shortcut = current.listen("probe-shortcut", () => log("shortcut", "fired"));
    return () => { void drop.then(fn => fn()); void result.then(fn => fn()); void shortcut.then(fn => fn()); };
  }, []);

  return <main>
    <h1>M1-02 · {current.label === "main" ? "Native drop" : "HTML drag"}</h1>
    <p>技术验证窗口，仅使用合成素材。{current.label === "main" ? "Tauri 原生接收开启。" : "Tauri 原生接收关闭。"}</p>
    <section className="drop-zone" onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault(); log("html-drop", Array.from(event.dataTransfer.files).map(file => file.name).join(", ") || "internal item");
    }}><strong>Explorer 文件拖入测试区</strong><span>成功接收后，下方日志显示实际文件名。</span></section>
    <h2>真实文件拖出（仅复制）</h2>
    {files.map((file, index) => <button className="file" key={file} onPointerDown={event => {
      if (event.button === 0) void invoke("start_native_drag", { index }).catch(error => log("error", String(error)));
    }}>拖出：{file}</button>)}
    <h2>HTML 内部排序</h2>
    <div className="sort-list">{order.map(item => <div className="sort-item" draggable key={item}
      onDragStart={event => { event.dataTransfer.setData("text/plain", item); event.dataTransfer.effectAllowed = "move"; log("html-drag-start", item); }}
      onDragEnd={event => log("html-drag-end", event.dataTransfer.dropEffect)}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={event => {
        event.preventDefault(); event.stopPropagation();
        const dragged = event.dataTransfer.getData("text/plain");
        log("html-drop-target", `${item}: ${dragged}`);
        if (!order.includes(dragged) || dragged === item) return;
        const next = order.filter(value => value !== dragged); next.splice(next.indexOf(item), 0, dragged);
        setOrder(next); log("html-reorder", next.join(" → "));
      }}>{item}</div>)}</div>
    <div className="controls">
      <button onClick={() => openFolder("source")}>打开合成素材</button>
      <button onClick={() => openFolder("target-a")}>打开 A 目标文件夹</button>
      <button onClick={() => openFolder("target-b")}>打开 B 目标文件夹</button>
      {current.label === "main" && <button onClick={() => void action("show_html_probe")}>打开 HTML 对照窗口</button>}
      <button onClick={() => void action("toggle_topmost").then(value => setTopmost(Boolean(value)))}>置顶：{topmost ? "开" : "关"}</button>
      <button onClick={() => void action("register_probe_shortcut")}>注册测试快捷键</button>
      <button onClick={() => void action("probe_info")}>记录窗口环境</button>
    </div>
    <p className="hint">快捷键：Ctrl + Alt + Shift + F12；冲突时报告错误，不抢占。托盘提供 Show / Quit。</p>
    <h2>事件记录</h2><output aria-live="polite">{events.join("\n") || "等待事件…"}</output>
  </main>;
}
