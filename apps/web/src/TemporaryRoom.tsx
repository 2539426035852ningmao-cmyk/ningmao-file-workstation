import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, FolderUp } from "lucide-react";
import { MAX_BROWSER_TRANSFER_BYTES } from "./file-preparation.mjs";
import "./rooms.css";

type Member = { id: string; name: string; role: "owner" | "admin" | "member"; status: "active" | "pending" };
type RoomFile = { id: string; sender: string; name: string; size: number; digest: string; expires: number; retain_until: number };
type Room = { code: string; member: Member; members: Member[]; files: RoomFile[]; inviteExpires: number };
type Theme = "light" | "dark" | "blue";
const day = 24 * 60 * 60 * 1000;
const api = "/api/rooms";
const formatDate = (time: number) => new Date(time).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

async function jsonPost<T>(path: string, data: object): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await response.json());
  return response.json();
}

async function digest(data: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function TemporaryRoom() {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("code") ?? "");
  const [draftCode, setDraftCode] = useState(code);
  const [theme, setTheme] = useState<Theme>("light");
  const [name, setName] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [membership, setMembership] = useState("");
  const [recovery, setRecovery] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const roomApi = `${api}/${encodeURIComponent(code)}`;

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  async function refresh(path: string, signal?: AbortSignal) {
    const response = await fetch(path, { signal, cache: "no-store" });
    if (signal?.aborted) return;
    if (response.ok) {
      const current = await response.json();
      if (!signal?.aborted) { setRoom(current); setMembership("active"); }
    } else {
      const details = await response.json();
      if (!signal?.aborted) {
        setRoom(null);
        setMembership(response.status === 404 ? "missing" : details.status ?? "");
      }
    }
  }
  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    const update = () => void refresh(`${api}/${encodeURIComponent(code)}`, controller.signal).catch(() => {
      if (!controller.signal.aborted) setProblem("暂时无法连接互传区，请稍后重试。");
    });
    update();
    const timer = window.setInterval(update, 2000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [code]);

  function navigate(target: string) {
    const next = target.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(next)) throw new Error("请输入完整的邀请码。");
    history.replaceState(null, "", `/rooms?code=${next}`);
    setDraftCode(next);
    if (next !== code) {
      setRoom(null);
      setMembership("");
      setCode(next);
    }
    return next;
  }

  async function perform(action: () => Promise<void>) {
    setProblem("");
    setMessage("");
    setBusy(true);
    try { await action(); }
    catch (error) { setProblem(error instanceof Error ? error.message : "操作失败，请重试。"); }
    finally { setBusy(false); }
  }

  const manage = room?.member.role === "owner" || room?.member.role === "admin";
  return <main className="room-page">
    <header className="room-header">
      <strong><FolderUp size={21} aria-hidden /> 柠猫文件工作站</strong>
      <label>主题 <select value={theme} onChange={event => setTheme(event.target.value as Theme)}>
        <option value="light">浅白</option><option value="dark">深蓝</option><option value="blue">亮蓝</option>
      </select></label>
    </header>
    <h1>临时互传区</h1>
    {problem && <p className="room-feedback" role="alert">{problem}</p>}
    {message && <p className="room-feedback" role="status">{message}</p>}
    {!room ? <section className="room-card">
      {membership === "pending" && <p role="status">等待群主或管理员批准加入。</p>}
      {membership === "denied" && <p role="status">加入申请未获批准。</p>}
      {membership === "missing" && <p role="status">找不到这个互传区，请检查邀请码。</p>}
      <fieldset disabled={busy}>
        <label>显示名称 <input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
        <form onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            const created = await jsonPost<{ code: string; recovery: string }>(api, { name, approval: requireApproval });
            setRecovery(created.recovery);
            navigate(created.code);
          });
        }}>
          <label className="room-choice"><input type="checkbox" checked={requireApproval} onChange={event => setRequireApproval(event.target.checked)} /> 入区需批准</label>
          <button type="submit" className="room-primary" disabled={!name.trim()}>创建互传区</button>
        </form>
        <form onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            const target = navigate(draftCode);
            const result = await jsonPost<{ member: Member }>(`${api}/${target}/join`, { name });
            setMembership(result.member.status);
            await refresh(`${api}/${target}`);
          });
        }}>
          <label>邀请码 <input value={draftCode} maxLength={32} onChange={event => setDraftCode(event.target.value)} /></label>
          <button type="submit" disabled={!name.trim() || !draftCode.trim()}>加入互传区</button>
        </form>
        <details><summary>恢复群主管理权限</summary><form onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            const target = navigate(draftCode);
            await jsonPost(`${api}/${target}/recover`, { recovery: recoveryInput.trim() });
            setRecoveryInput("");
            await refresh(`${api}/${target}`);
          });
        }}>
          <label>管理恢复码 <input type="password" value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)} /></label>
          <button type="submit" disabled={!draftCode || !recoveryInput}>恢复管理权限</button>
        </form></details>
      </fieldset>
    </section> : <>
      <section className="room-card">
        <h2>{room.member.name} <small>{room.member.role === "owner" ? "群主" : room.member.role === "admin" ? "管理员" : "成员"}</small></h2>
        <label>邀请链接 <input readOnly value={location.href} onFocus={event => event.target.select()} /></label>
        <p className="room-note">邀请有效至 {formatDate(room.inviteExpires)}</p>
        {recovery && <details open><summary>保存管理恢复码</summary><label>管理恢复码 <input readOnly value={recovery} onFocus={event => event.target.select()} /></label></details>}
        {manage && room.members.filter(member => member.id !== room.member.id).map(member => (
          <div className="room-row" key={member.id}>
            <span>{member.name} <small>{member.status === "pending" ? "待批准" : member.role === "admin" ? "管理员" : "成员"}</small></span>
            {member.status === "pending" ? [true, false].map(accept => <button key={String(accept)} disabled={busy} onClick={() => void perform(async () => {
              await jsonPost(roomApi + "/decide", { id: member.id, accept });
              await refresh(roomApi);
            })}>{accept ? "批准" : "拒绝"}</button>) : room.member.role === "owner" &&
              <button disabled={busy} onClick={() => void perform(async () => {
                await jsonPost(roomApi + "/promote", { id: member.id, enabled: member.role !== "admin" });
                await refresh(roomApi);
              })}>{member.role === "admin" ? "取消管理员" : "设为管理员"}</button>}
          </div>
        ))}
      </section>
      <section className="room-card">
        <h2>共享文件</h2>
        <form onSubmit={event => {
          event.preventDefault();
          const source = file;
          if (!source) return;
          void perform(async () => {
            if (source.size > MAX_BROWSER_TRANSFER_BYTES) throw new Error("本阶段单文件最多 64 MiB。");
            const hash = await digest(await source.arrayBuffer());
            const response = await fetch(roomApi + "/files", {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(source.name), "X-SHA256": hash },
              body: source,
            });
            if (!response.ok) throw new Error(await response.json());
            setFile(null);
            if (fileInput.current) fileInput.current.value = "";
            setMessage("文件校验通过，已发到临时互传区。");
            await refresh(roomApi);
          });
        }}>
          <label>选择文件 <input type="file" ref={fileInput} disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
          {file && <p className="room-note">{file.name} · {formatSize(file.size)}</p>}
          <button type="submit" className="room-primary" disabled={busy || !file}>发给全区 {room.members.filter(member => member.status === "active").length} 人</button>
          <p className="room-note">单文件最多 64 MiB，校验成功后保留 24 小时。</p>
        </form>
        {room.files.length === 0 && <p className="room-note">区内还没有文件。</p>}
        {room.files.map(item => <article key={item.id} className="room-file">
          <div><strong>{item.name}</strong><p className="room-note">{formatSize(item.size)} · 可离线领取至 {formatDate(item.expires)}</p></div>
          <div className="room-row">
            <button disabled={busy} aria-label={`保存 ${item.name}`} onClick={() => void perform(async () => {
              const response = await fetch(roomApi + "/files/" + item.id);
              if (!response.ok) throw new Error(await response.json());
              const body = await response.arrayBuffer();
              if (body.byteLength !== item.size || await digest(body) !== item.digest) throw new Error("文件校验失败，未保存。");
              const url = URL.createObjectURL(new Blob([body]));
              const link = document.createElement("a");
              link.href = url;
              link.download = item.name;
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
              setMessage("校验通过，已交给浏览器保存。");
            })}><ArrowDownToLine size={16} aria-hidden /> 保存</button>
            {(manage || item.sender === room.member.id) && <>
              {item.expires < item.retain_until && <button disabled={busy} onClick={() => {
                const expires = item.expires + day;
                if (window.confirm(`延至 ${formatDate(expires)}？`)) void perform(async () => {
                  await jsonPost(roomApi + "/extend", { id: item.id, expires });
                  await refresh(roomApi);
                });
              }}>延期</button>}
              <button disabled={busy} onClick={() => {
                if (window.confirm(`撤回「${item.name}」？`)) void perform(async () => {
                  await jsonPost(roomApi + "/revoke", { id: item.id });
                  await refresh(roomApi);
                });
              }}>撤回</button>
            </>}
          </div>
        </article>)}
      </section>
    </>}
  </main>;
}
