import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, FolderUp } from "lucide-react";
import { MAX_BROWSER_TRANSFER_BYTES } from "./file-preparation.mjs";
import { downloadBulk, FILE_MAX, uploadBulk } from "./bulkTransfer";
import { RoomPeerSources } from "./roomPeerSources";
import "./rooms.css";

type Member = { id: string; name: string; role: "owner" | "admin" | "member"; status: "active" | "pending" };
type RoomFile = { id: string; sender: string; name: string; size: number; digest: string; expires: number; retain_until: number; chunked?: number };
type Room = { code: string; member: Member; members: Member[]; files: RoomFile[]; inviteExpires: number; memberLimit?: number; bulk?: boolean };
type Theme = "light" | "dark" | "blue";
const day = 24 * 60 * 60 * 1000;
const retentionHours = (size: number) => size >= 10_000_000_000 ? 6 : 24;
const api = "/api/rooms";
const formatDate = (time: number) => new Date(time).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
const needsSaveClick = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function invitationCode(text: string) {
  const value = text.trim();
  if (/^[a-f0-9]{32}$/i.test(value)) return value.toLowerCase();
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("请粘贴本站的邀请链接或完整邀请码。"); }
  const code = url.searchParams.get("code");
  if (url.origin !== location.origin || !["/", "/rooms"].includes(url.pathname)
      || url.username || url.password || url.hash || [...url.searchParams].length !== 1
      || !code || !/^[a-f0-9]{32}$/i.test(code)) {
    throw new Error("请粘贴本站的邀请链接或完整邀请码。");
  }
  return code.toLowerCase();
}

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
  const [entry, setEntry] = useState<"create" | "join">(code ? "join" : "create");
  const [theme, setTheme] = useState<Theme>("light");
  const [name, setName] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [membership, setMembership] = useState("");
  const [recovery, setRecovery] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [retryUpload, setRetryUpload] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [stationOffline, setStationOffline] = useState(false);
  const peers = useRef<RoomPeerSources | null>(null);
  const [seedCopies, setSeedCopies] = useState<Record<string, File>>({});
  const [seeding, setSeeding] = useState<string[]>([]);
  const [verified, setVerified] = useState<Record<string, File>>({});
  const roomApi = `${api}/${encodeURIComponent(code)}`;
  const invitation = `${location.origin}/rooms?code=${encodeURIComponent(code)}`;
  const tooLarge = !!file && file.size > (room?.bulk ? FILE_MAX : MAX_BROWSER_TRANSFER_BYTES);
  const remoteBlocked = busy || stationOffline;

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  async function refresh(path: string, signal?: AbortSignal) {
    const response = await fetch(path, { signal, cache: "no-store" });
    if (signal?.aborted) return;
    if (!response.ok && response.status !== 403 && response.status !== 404) {
      throw new Error("暂时无法读取互传区，请稍后重试。");
    }
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
    let active = true;
    let request: AbortController;
    let timer: number;
    const update = async () => {
      request = new AbortController();
      const timeout = window.setTimeout(() => request.abort(), 8000);
      try {
        const signal = request.signal;
        await refresh(`${api}/${encodeURIComponent(code)}`, signal);
        if (active) setStationOffline(signal.aborted);
      } catch {
        if (active) setStationOffline(true);
      } finally {
        window.clearTimeout(timeout);
      }
      if (active) timer = window.setTimeout(update, 2000);
    };
    void update();
    return () => { active = false; request.abort(); window.clearTimeout(timer); };
  }, [code]);

  const peerEnabled = Boolean(room?.bulk && room.member.status === "active" && window.RTCPeerConnection);
  useEffect(() => {
    if (!peerEnabled) return;
    const client = new RoomPeerSources(roomApi);
    peers.current = client;
    return () => {
      client.close();
      peers.current = null;
    };
  }, [peerEnabled, roomApi]);

  useEffect(() => {
    const files = new Set(room?.files.map(item => item.id));
    const expired = seeding.filter(id => !files.has(id));
    if (!expired.length) return;
    for (const id of expired) void peers.current?.share(id, null);
    setSeeding(current => current.filter(id => files.has(id)));
  }, [room, seeding]);

  useEffect(() => {
    if (!/Android/i.test(navigator.userAgent)) return;
    const onVisibility = () => {
      if (!document.hidden) return;
      for (const id of seeding) void peers.current?.share(id, null);
      setSeeding([]);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [seeding]);

  function navigate(target: string) {
    const next = invitationCode(target);
    history.replaceState(null, "", `/rooms?code=${next}`);
    setDraftCode(next);
    if (next !== code) {
      setRoom(null);
      setMembership("");
      setStationOffline(false);
      setRetryUpload(null);
      setCode(next);
    }
    return next;
  }

  async function perform(action: () => Promise<void>) {
    setProblem("");
    setMessage("");
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      setProblem(error instanceof TypeError ? "连接失败，请稍后重试。"
        : error instanceof Error ? error.message : "操作失败，请重试。");
      return false;
    }
    finally { setBusy(false); }
  }

  function progress(label: string, bytes: number, total: number) {
    setMessage(`${label} ${formatSize(bytes)} / ${formatSize(total)}`);
  }

  function saveFromBrowser(file: Blob, name: string) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setMessage("校验通过，已交给浏览器保存。");
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitation);
      setProblem("");
      setMessage("邀请链接已复制。");
    } catch {
      setMessage("");
      setProblem("无法复制邀请链接，请选中链接手动复制。");
    }
  }

  const manage = room?.member.role === "owner" || room?.member.role === "admin";
  const activeMembers = room?.members.filter(member => member.status === "active") ?? [];
  const pendingMembers = room?.members.filter(member => member.status === "pending") ?? [];
  const senderNames = new Map(activeMembers.map(member => [member.id, member.name]));
  const memberLimit = room?.memberLimit;
  const roomFull = memberLimit !== undefined && activeMembers.length >= memberLimit;
  const mobileInvite = location.protocol === "https:"
    && !/^(?:(?:.+\.)?localhost\.?$|127\.|\[::1\]$)/i.test(location.hostname);

  function depart(member?: Member) {
    if (!window.confirm(member ? `将「${member.name}」移出文件群？` : "退出这个文件群？")) return;
    void perform(async () => {
      await jsonPost(roomApi + (member ? "/remove" : "/leave"), member ? { id: member.id } : {});
      await refresh(roomApi);
    });
  }

  return <main className="room-page">
    <header className="room-header">
      <strong><FolderUp size={21} aria-hidden /> 柠猫文件工作站</strong>
      <label>主题 <select value={theme} onChange={event => setTheme(event.target.value as Theme)}>
        <option value="light">浅白</option><option value="dark">深蓝</option><option value="blue">亮蓝</option>
      </select></label>
    </header>
    <h1>临时互传区</h1>
    {stationOffline && <p className="room-feedback" role="alert">互传站点暂时无法连接，恢复后会自动刷新。</p>}
    {problem && <p className="room-feedback" role="alert">{problem}</p>}
    {message && <p className="room-feedback" role="status">{message}</p>}
    {!room ? <section className="room-card">
      {membership === "pending" && <p role="status">等待群主或管理员批准加入。</p>}
      {membership === "denied" && <p role="status">加入申请未获批准。</p>}
      {membership === "left" && <p role="status">你已退出文件群，可使用邀请重新加入。</p>}
      {membership === "removed" && <p role="status">你已被移出这个文件群。</p>}
      {membership === "missing" && <p role="status">找不到这个互传区，请检查邀请码。</p>}
      <fieldset disabled={busy}>
        <div className="room-entry-tabs" role="group" aria-label="进入方式">
          <button type="button" aria-pressed={entry === "create"} onClick={() => setEntry("create")}>发起新区</button>
          <button type="button" aria-pressed={entry === "join"} onClick={() => setEntry("join")}>有邀请链接</button>
        </div>
        <label>显示名称 <input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
        {entry === "create" ? <form onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            const created = await jsonPost<{ code: string; recovery: string }>(api, { name, approval: requireApproval });
            setRecovery(created.recovery);
            navigate(created.code);
          });
        }}>
          <label className="room-choice"><input type="checkbox" checked={requireApproval} onChange={event => setRequireApproval(event.target.checked)} /> 入区需批准</label>
          <button type="submit" className="room-primary" disabled={!name.trim()}>创建互传区</button>
        </form> : <>
        <form onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            const target = navigate(draftCode);
            const result = await jsonPost<{ member: Member }>(`${api}/${target}/join`, { name });
            setMembership(result.member.status);
            await refresh(`${api}/${target}`);
          });
        }}>
          <label>邀请链接或邀请码 <input value={draftCode} maxLength={2048} onChange={event => setDraftCode(event.target.value)} /></label>
          <button type="submit" className="room-primary" disabled={!name.trim() || !draftCode.trim() || (membership === "pending" && draftCode === code)}>加入互传区</button>
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
        </form></details></>}
      </fieldset>
    </section> : <>
      <section className="room-card">
        <h2>{room.member.name} <small>{room.member.role === "owner" ? "群主" : room.member.role === "admin" ? "管理员" : "成员"}</small></h2>
        <label>邀请链接 <input readOnly value={invitation} onFocus={event => event.target.select()} /></label>
        <div className="room-row room-invite-actions">
          <button type="button" onClick={() => void copyInvitation()}>复制邀请链接</button>
          <span className="room-note">邀请有效至 {formatDate(room.inviteExpires)}</span>
          {memberLimit !== undefined && room.member.role !== "owner" &&
            <button type="button" disabled={remoteBlocked} onClick={() => depart()}>退出文件群</button>}
        </div>
        <details key={code}>
          <summary>手机扫码加入</summary>
          {mobileInvite ? <>
            <QRCodeCanvas value={invitation} size={192} marginSize={4} role="img" aria-label="互传区邀请二维码" />
            <p className="room-note">用手机相机扫码，打开邀请后申请加入。</p>
          </> : <p className="room-note">请用手机可访问的 HTTPS 站点创建互传区。</p>}
        </details>
        {recovery && <details><summary>保存管理恢复码</summary><label>管理恢复码 <input readOnly value={recovery} onFocus={event => event.target.select()} /></label></details>}
        <details className="room-members">
          <summary>{memberLimit === undefined ? `文件群成员 ${activeMembers.length} 人` : `文件群成员 ${activeMembers.length} / ${memberLimit} 人`}</summary>
          <ul>
            {activeMembers.map(member => <li key={member.id}>
              <div className="room-row">
                <span>{member.name} <small>{member.role === "owner" ? "群主" : member.role === "admin" ? "管理员" : "成员"}</small></span>
                {room.member.role === "owner" && member.id !== room.member.id &&
                  <button disabled={remoteBlocked} onClick={() => void perform(async () => {
                    await jsonPost(roomApi + "/promote", { id: member.id, enabled: member.role !== "admin" });
                    await refresh(roomApi);
                  })}>{member.role === "admin" ? "取消管理员" : "设为管理员"}</button>}
                {memberLimit !== undefined && manage && member.id !== room.member.id &&
                  (member.role === "member" || (member.role === "admin" && room.member.role === "owner")) &&
                  <button disabled={remoteBlocked} aria-label={`移出 ${member.name}`} onClick={() => depart(member)}>移出</button>}
              </div>
            </li>)}
          </ul>
        </details>
        {manage && pendingMembers.length > 0 && <div className="room-pending">
          <h3>待批准访客</h3>
          {roomFull && <p className="room-note">文件群已满，有空位后可批准加入。</p>}
          {pendingMembers.map(member => <div className="room-row" key={member.id}>
            <span>{member.name}</span>
            {[true, false].map(accept => <button key={String(accept)} disabled={remoteBlocked || (accept && roomFull)} onClick={() => void perform(async () => {
              await jsonPost(roomApi + "/decide", { id: member.id, accept });
              await refresh(roomApi);
            })}>{accept ? "批准" : "拒绝"}</button>)}
          </div>)}
        </div>}
      </section>
      <section className="room-card">
        <h2>发送文件</h2>
        <form onSubmit={event => {
          event.preventDefault();
          const source = file;
          if (!source) return;
          void perform(async () => {
            if (source.size > (room.bulk ? FILE_MAX : MAX_BROWSER_TRANSFER_BYTES)) {
              throw new Error(room.bulk ? "单文件最多 20 GB。" : "此互传区单文件最多 64 MiB。");
            }
            if (room.bulk) {
              const id = await uploadBulk(roomApi, source, progress);
              setSeedCopies(current => ({ ...current, [id]: source }));
            }
            else {
              const hash = await digest(await source.arrayBuffer());
              const response = await fetch(roomApi + "/files", {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(source.name), "X-SHA256": hash },
                body: source,
              });
              if (!response.ok) throw new Error(await response.json());
            }
            setFile(null);
            if (fileInput.current) fileInput.current.value = "";
            setMessage("文件校验通过，已发到临时互传区。");
            await refresh(roomApi);
          }).then(sent => setRetryUpload(sent ? null : source));
        }}>
          <label>选择文件 <input type="file" ref={fileInput} disabled={busy} onChange={event => {
            setFile(event.target.files?.[0] ?? null);
            setRetryUpload(null);
          }} /></label>
          {file && <p className="room-note">{file.name}（{formatSize(file.size)}）　{tooLarge ? "超过单文件上限，请重新选择。" : `发布后可领取 ${retentionHours(file.size)} 小时`}</p>}
          <button type="submit" className="room-primary" disabled={remoteBlocked || !file || tooLarge}>
            {file && file === retryUpload ? (room.bulk ? "续传原文件" : "重试发送") : `发给全区 ${activeMembers.length} 人`}
          </button>
          <p className="room-note">{room.bulk ? "单文件最多 20 GB。中断后可重选原文件续传。" : "单文件最多 64 MiB，校验成功后保留 24 小时。"}</p>
        </form>
      </section>
      <section className="room-card">
        <h2>共享文件</h2>
        {room.files.length === 0 && <p className="room-note">区内还没有文件。</p>}
        {room.files.map(item => <article key={item.id} className="room-file">
          <div>
            <strong>{item.name}</strong>
            <p className="room-note">{item.sender === room.member.id ? "我发送的"
              : senderNames.has(item.sender) ? `发件人 ${senderNames.get(item.sender)}` : "发件人已离群"}</p>
            <p className="room-note">{formatSize(item.size)} · 领取期限 {formatDate(item.expires)}</p>
          </div>
          <div className="room-row">
            <button className="room-primary" disabled={busy || (stationOffline && !verified[item.id])} aria-label={`${item.chunked && needsSaveClick && !verified[item.id] ? "准备保存" : "保存"} ${item.name}`} onClick={() => void perform(async () => {
              if (item.chunked) {
                const ready = verified[item.id];
                if (ready) { saveFromBrowser(ready, item.name); return; }
                const downloaded = await downloadBulk(roomApi + "/files/" + item.id, item, progress, peers.current?.download(item.id));
                setVerified(state => ({ ...state, [item.id]: downloaded }));
                if (needsSaveClick) setMessage("文件校验通过，请点击保存。");
                else saveFromBrowser(downloaded, item.name);
                return;
              }
              const response = await fetch(roomApi + "/files/" + item.id);
              if (!response.ok) throw new Error(await response.json());
              const body = await response.arrayBuffer();
              if (body.byteLength !== item.size || await digest(body) !== item.digest) throw new Error("文件校验失败，未保存。");
              saveFromBrowser(new Blob([body]), item.name);
            })}><ArrowDownToLine size={16} aria-hidden /> {item.chunked && verified[item.id] ? "保存" : item.chunked && needsSaveClick ? "准备保存" : "下载"}</button>
            {peerEnabled && item.chunked && item.size > 0 && (seedCopies[item.id] || verified[item.id]) &&
              <button disabled={busy || (stationOffline && !seeding.includes(item.id))} aria-label={`${seeding.includes(item.id) ? "停止供件" : "开始供件"} ${item.name}`}
                onClick={() => void perform(async () => {
                  const active = seeding.includes(item.id);
                  await peers.current?.share(item.id, active ? null : seedCopies[item.id] ?? verified[item.id]);
                  setSeeding(current => active ? current.filter(id => id !== item.id) : [...current, item.id]);
                  setMessage(active ? "本设备已停止供件。" : "本设备在线时，可向区内成员供件。");
                })}>{seeding.includes(item.id) ? "停止供件" : "开始供件"}</button>}
            {(manage || item.sender === room.member.id) && <>
              {item.expires < item.retain_until && <button disabled={remoteBlocked} onClick={() => {
                const expires = item.expires + retentionHours(item.size) * day / 24;
                if (window.confirm(`延至 ${formatDate(expires)}？`)) void perform(async () => {
                  await jsonPost(roomApi + "/extend", { id: item.id, expires });
                  await refresh(roomApi);
                });
              }}>延期</button>}
              <button disabled={remoteBlocked} onClick={() => {
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
