import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Clipboard, Clock3, FolderOpen, FolderUp, Search, Send, X } from "lucide-react";
import { MAX_BROWSER_TRANSFER_BYTES } from "./file-preparation.mjs";
import { downloadBulk, FILE_MAX, uploadBulk } from "./bulkTransfer";
import { RoomAvatar, RoomFileIcon, RoomRecipients } from "./RoomVisuals";
import { RoomPeerSources } from "./roomPeerSources";
import { RoomChat } from "./StationSocial";
import "./rooms.css";

type Member = { id: string; name: string; role: "owner" | "admin" | "member"; status: "active" | "pending" };
type RoomFile = { id: string; sender: string; name: string; size: number; digest: string; expires: number; retain_until: number; chunked?: number; directed?: number };
type Room = { code: string; member: Member; members: Member[]; files: RoomFile[]; inviteExpires: number | null; memberLimit?: number; bulk?: boolean; directed?: boolean; fixed?: boolean; direct?: boolean; title?: string; management?: { standby: string | null; active: number } };
type Theme = "light" | "dark" | "blue";
type TransferProgress = { id: string | null; label: string; bytes: number; total: number };
const day = 24 * 60 * 60 * 1000;
const retentionHours = (size: number) => size >= 10_000_000_000 ? 6 : 24;
const api = "/api/rooms";
const formatDate = (time: number) => new Date(time).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
const formatSize = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} B`;
};
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

function TransferMeter({ label, bytes, total }: TransferProgress) {
  return <div className="room-transfer-meter">
    <span>{label}</span>
    {total > 0 && <>
      <span>{formatSize(bytes)} / {formatSize(total)}</span>
      <progress aria-label={label} max={total} value={bytes} />
    </>}
  </div>;
}

export function TemporaryRoom() {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("code") ?? "");
  const [draftCode, setDraftCode] = useState(code);
  const [entry, setEntry] = useState<"create" | "join">(code ? "join" : "create");
  const [theme, setTheme] = useState<Theme>("light");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [membership, setMembership] = useState("");
  const [recovery, setRecovery] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [retryUpload, setRetryUpload] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<string[] | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [fileDirection, setFileDirection] = useState("all");
  const fileInput = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<TransferProgress | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [stationOffline, setStationOffline] = useState(false);
  const peers = useRef<RoomPeerSources | null>(null);
  const [seedCopies, setSeedCopies] = useState<Record<string, File>>({});
  const [seeding, setSeeding] = useState<string[]>([]);
  const [verified, setVerified] = useState<Record<string, File>>({});
  const [handedOff, setHandedOff] = useState<Record<string, true>>({});
  const roomApi = `${api}/${encodeURIComponent(code)}`;
  const invitation = `${location.origin}/rooms?code=${encodeURIComponent(code)}`;
  const tooLarge = !!file && file.size > (room?.bulk ? FILE_MAX : MAX_BROWSER_TRANSFER_BYTES);
  const remoteBlocked = busy || stationOffline;

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!controller.signal.aborted) setAccount(value?.account?.username ?? ""); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);
  async function refresh(path: string, signal?: AbortSignal) {
    const response = await fetch(path, { signal, cache: "no-store" });
    if (signal?.aborted) return;
    if (!response.ok && response.status !== 401 && response.status !== 403 && response.status !== 404) {
      throw new Error("暂时无法读取互传区，请稍后重试。");
    }
    if (response.ok) {
      const current = await response.json();
      if (!signal?.aborted) { setRoom(current); setMembership("active"); }
    } else {
      const details = await response.json();
      if (!signal?.aborted) {
        setRoom(null);
        setMembership(response.status === 401 ? "sign-in" : response.status === 404 ? "missing" : details.status ?? "");
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
      setCopied(false);
      setHandedOff({});
      setFile(null);
      setDragging(false);
      setRetryUpload(null);
      setRecipients(null);
      setFileQuery("");
      setFileDirection("all");
      setCode(next);
    }
    return next;
  }

  async function perform(action: () => Promise<void>, progressStart: TransferProgress | null = null) {
    setProblem("");
    setMessage("");
    setBusy(true);
    setTransfer(progressStart);
    try {
      await action();
      return true;
    } catch (error) {
      setProblem(error instanceof TypeError ? "连接失败，请稍后重试。"
        : error instanceof Error ? error.message : "操作失败，请重试。");
      return false;
    }
    finally { setBusy(false); setTransfer(null); }
  }

  function progress(label: string, bytes: number, total: number) {
    setTransfer(current => current && { ...current, label, bytes, total });
    setMessage(`${label} ${formatSize(bytes)} / ${formatSize(total)}`);
  }

  function selectFile(source: File | null) {
    setFile(source);
    setRetryUpload(null);
    setProblem("");
    setMessage("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function saveFromBrowser(file: Blob, item: RoomFile) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = item.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setHandedOff(current => ({ ...current, [item.id]: true }));
    setMessage("校验通过，已交给浏览器保存。");
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitation);
      setCopied(true);
      setProblem("");
      setMessage("邀请链接已复制。");
    } catch {
      setCopied(false);
      setMessage("");
      setProblem("无法复制邀请链接，请选中链接手动复制。");
    }
  }

  const owner = room?.member.role === "owner";
  const isStandby = room?.management?.standby === room?.member.id && Boolean(room?.member.id);
  const manage = room?.management?.active ? isStandby : owner || room?.member.role === "admin";
  const activeMembers = (room?.members.filter(member => member.status === "active") ?? [])
    .map((member, avatarSlot) => ({ ...member, avatarSlot }));
  const pendingMembers = room?.members.filter(member => member.status === "pending") ?? [];
  const roomMembers = new Map(activeMembers.map(member => [member.id, member]));
  const query = fileQuery.trim().toLowerCase();
  const visibleFiles = room?.files.filter(item => {
    const sent = item.sender === room.member.id;
    return (fileDirection === "all" || (fileDirection === "sent" ? sent : !sent))
      && item.name.toLowerCase().includes(query);
  }) ?? [];
  const eligible = activeMembers.filter(member => member.id !== room?.member.id);
  const invalidAudience = recipients !== null && (!room?.directed || !recipients.length
    || !recipients.every(id => eligible.some(member => member.id === id)));
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

  return <main className={room ? "room-page room-page-active" : "room-page"}>
    <header className="room-header">
      <strong><FolderUp size={21} aria-hidden /> 柠猫文件工作站</strong>
      <div className="room-row">
        <a className="room-nav-link" aria-label="账号" href={code ? `/account?room=${encodeURIComponent(code)}` : "/account"}>{account || "账号"}</a>
        {account && <a className="room-nav-link" href="/social">好友与文件群</a>}
        <label>主题 <select value={theme} onChange={event => setTheme(event.target.value as Theme)}>
          <option value="light">浅白</option><option value="dark">深蓝</option><option value="blue">亮蓝</option>
        </select></label>
      </div>
    </header>
    <h1>{room?.title ?? "临时互传区"}</h1>
    {stationOffline && <p className="room-feedback" role="alert">互传站点暂时无法连接，恢复后会自动刷新。</p>}
    {problem && <p className="room-feedback" role="alert">{problem}</p>}
    {message && <p className={transfer || (copied && message === "邀请链接已复制。")
      ? "room-feedback room-visually-hidden" : "room-feedback"} role="status">{message}</p>}
    {!room ? <section className="room-card">
      {membership === "pending" && <p role="status">等待群主或管理员批准加入。</p>}
      {membership === "denied" && <p role="status">加入申请未获批准。</p>}
      {membership === "left" && <p role="status">你已退出文件群，可使用邀请重新加入。</p>}
      {membership === "removed" && <p role="status">你已被移出这个文件群。</p>}
      {membership === "missing" && <p role="status">找不到这个互传区，请检查邀请码。</p>}
      {membership === "sign-in" && <p role="status">请先登录账号，再打开这个文件群。</p>}
      <fieldset disabled={busy}>
        <div className="room-entry-tabs" role="group" aria-label="进入方式">
          <button type="button" aria-pressed={entry === "create"} onClick={() => setEntry("create")}>发起新区</button>
          <button type="button" aria-pressed={entry === "join"} onClick={() => setEntry("join")}>有邀请链接</button>
        </div>
        {account ? <p className="room-note">使用账号 {account}</p>
          : <label>显示名称 <input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>}
        {entry === "create" ? <form onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            const created = await jsonPost<{ code: string; recovery: string }>(api, { name, approval: requireApproval });
            setRecovery(created.recovery);
            navigate(created.code);
          });
        }}>
          <label className="room-choice"><input type="checkbox" checked={requireApproval} onChange={event => setRequireApproval(event.target.checked)} /> 入区需批准</label>
          <button type="submit" className="room-primary" disabled={!account && !name.trim()}>创建互传区</button>
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
          <button type="submit" className="room-primary" disabled={(!account && !name.trim()) || !draftCode.trim() || (membership === "pending" && draftCode === code)}>加入互传区</button>
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
      <section className="room-card room-context">
        <div className="room-context-bar">
          <h2 className="room-identity"><RoomAvatar id={room.member.id} slot={roomMembers.get(room.member.id)?.avatarSlot} /> <span>{room.member.name} <small>{room.member.role === "owner" ? "群主" : room.member.role === "admin" ? "管理员" : "成员"}</small></span></h2>
          {!room.direct && <div className="room-invite-actions">
            <label><span className="room-visually-hidden">邀请链接</span><input readOnly value={invitation} onFocus={event => event.target.select()} /></label>
            <button type="button" className="room-copy-button" onClick={() => void copyInvitation()}>
              {copied ? <Check key="copied" className="room-copy-check" size={16} aria-hidden /> : <Clipboard size={16} aria-hidden />}
              {copied ? "已复制" : "复制邀请链接"}
            </button>
          </div>}
        </div>
        <div className="room-context-options">
          {!room.direct && <details key={code}>
            <summary>手机扫码加入</summary>
            {mobileInvite ? <>
              <QRCodeCanvas value={invitation} size={192} marginSize={4} role="img" aria-label="互传区邀请二维码" />
              <p className="room-note">用手机相机扫码，打开邀请后申请加入。</p>
            </> : <p className="room-note">请用手机可访问的 HTTPS 站点创建互传区。</p>}
            {room.inviteExpires && <p className="room-note">邀请有效至 {formatDate(room.inviteExpires)}</p>}
          </details>}
          <details className="room-members">
            <summary>{memberLimit === undefined ? `文件群成员 ${activeMembers.length} 人` : `文件群成员 ${activeMembers.length} / ${memberLimit} 人`}</summary>
            <ul>
              {activeMembers.map(member => <li key={member.id}>
                <div className="room-row">
                  <span className="room-identity"><RoomAvatar id={member.id} slot={member.avatarSlot} /><span>{member.name} <small>{member.role === "owner" ? "群主" : member.role === "admin" ? "管理员" : "成员"}</small></span></span>
                  {owner && manage && !room.direct && member.id !== room.member.id &&
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
          {recovery && <details><summary>保存管理恢复码</summary><label>管理恢复码 <input readOnly value={recovery} onFocus={event => event.target.select()} /></label></details>}
          {room.management && (owner || isStandby) && <details>
            <summary>群管理交接</summary>
            <p className="room-note">当前站点在线时，指定的管理员可以继续处理群审批和成员管理。</p>
            {room.management.active ? <>
              <p>值守管理员正在管理此群。</p>
              <button type="button" disabled={remoteBlocked} onClick={() => void perform(async () => {
                await jsonPost(roomApi + "/hosting", { action: "return" });
                await refresh(roomApi);
              })}>交回群主管理</button>
            </> : <>
              {owner && <form onSubmit={event => {
                event.preventDefault();
                const id = String(new FormData(event.currentTarget).get("standby") ?? "");
                void perform(async () => {
                  await jsonPost(roomApi + "/hosting", { action: "designate", id });
                  await refresh(roomApi);
                });
              }}>
                <label>备用管理员<select name="standby" key={room.management.standby ?? ""} defaultValue={room.management.standby ?? ""} required disabled={remoteBlocked}>
                  <option value="">请选择管理员</option>
                  {activeMembers.filter(member => member.role === "admin").map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select></label>
                <button type="submit" disabled={remoteBlocked}>指定备用管理员</button>
              </form>}
              {isStandby && <button type="button" disabled={remoteBlocked} onClick={() => void perform(async () => {
                await jsonPost(roomApi + "/hosting", { action: "start" });
                await refresh(roomApi);
              })}>继续群管理</button>}
            </>}
          </details>}
          {!room.direct && memberLimit !== undefined && room.member.role !== "owner" &&
            <button className="room-quiet-action" type="button" disabled={remoteBlocked} onClick={() => depart()}>退出文件群</button>}
        </div>
        {manage && pendingMembers.length > 0 && <div className="room-pending">
          <h3>待批准访客</h3>
          {roomFull && <p className="room-note">文件群已满，有空位后可批准加入。</p>}
          {pendingMembers.map(member => <div className="room-row" key={member.id}>
            <span className="room-identity"><RoomAvatar id={member.id} />{member.name}</span>
            {[true, false].map(accept => <button key={String(accept)} disabled={remoteBlocked || (accept && roomFull)} onClick={() => void perform(async () => {
              await jsonPost(roomApi + "/decide", { id: member.id, accept });
              await refresh(roomApi);
            })}>{accept ? "批准" : "拒绝"}</button>)}
          </div>)}
        </div>}
      </section>
      <div className="room-workspace">
        <section className="room-card room-composer" aria-labelledby="room-send-heading">
          <h2 id="room-send-heading">发送文件</h2>
          <form data-has-file={!!file} onSubmit={event => {
            event.preventDefault();
            const source = file;
            if (!source || remoteBlocked || invalidAudience) return;
            void perform(async () => {
              if (source.size > (room.bulk ? FILE_MAX : MAX_BROWSER_TRANSFER_BYTES)) {
                throw new Error(room.bulk ? "单文件最多 20 GB。" : "此互传区单文件最多 64 MiB。");
              }
              if (room.bulk) {
                const id = await uploadBulk(roomApi, source, progress, recipients);
                setSeedCopies(current => ({ ...current, [id]: source }));
              }
              else {
                const hash = await digest(await source.arrayBuffer());
                progress("上传", 0, source.size);
                const response = await fetch(roomApi + "/files", {
                  method: "POST",
                  headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(source.name), "X-SHA256": hash },
                  body: source,
                });
                if (!response.ok) throw new Error(await response.json());
              }
              setFile(null);
              setMessage(room.fixed ? "文件校验通过，已发到文件群。" : "文件校验通过，已发到临时互传区。");
              await refresh(roomApi);
            }, { id: null, label: "准备发送", bytes: 0, total: source.size }).then(sent => setRetryUpload(sent ? null : source));
          }}>
            <input hidden type="file" ref={fileInput} aria-label="选择文件" disabled={busy} onChange={event => {
              if (event.target.files?.length) selectFile(event.target.files[0]);
            }} />
            <div className="room-file-picker" data-dragging={dragging} data-selected={!!file}
              onDragOver={event => {
                event.preventDefault();
                if (!event.dataTransfer.types.includes("Files")) return;
                event.dataTransfer.dropEffect = busy ? "none" : "copy";
                if (!busy) setDragging(true);
              }} onDragLeave={event => {
                if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false);
              }} onDrop={event => {
                event.preventDefault();
                setDragging(false);
                if (busy) return;
                if (event.dataTransfer.files.length > 1) {
                  setMessage("");
                  setProblem("一次可发送一个文件，请拖入单个文件。");
                } else if (event.dataTransfer.files.length === 1) selectFile(event.dataTransfer.files[0]);
              }}>
              {file && <div className="room-file-preview" role="group" aria-label="所选文件">
                <RoomFileIcon name={file.name} file={file} alt="所选文件的缩略图" />
                <div><strong>{file.name}</strong><p className="room-note">{formatSize(file.size)} · {tooLarge
                  ? "超过单文件上限，请重新选择。" : `发布后可领取 ${retentionHours(file.size)} 小时`}</p></div>
                <button type="button" className="room-clear-file" aria-label="移除所选文件" disabled={busy}
                  onClick={() => { selectFile(null); filePicker.current?.focus(); }}><X size={18} aria-hidden /></button>
              </div>}
              <button type="button" ref={filePicker} className="room-pick-button" disabled={busy}
                onClick={() => fileInput.current?.click()}>
                {file ? <FolderOpen size={17} aria-hidden /> : <FolderUp size={21} aria-hidden />}
                <span><strong>{file ? "更换文件" : "选择文件"}</strong>
                  {!file && <small className="room-drop-hint" aria-hidden="true">也可拖入单个文件</small>}</span>
              </button>
            </div>
            {(room.directed || recipients !== null) && <RoomRecipients members={eligible} recipients={recipients}
              select={value => { setRecipients(value); setRetryUpload(null); }}
              enabled={Boolean(room.directed)} disabled={remoteBlocked} />}
            {transfer && transfer.id === null && <TransferMeter {...transfer} />}
            <button type="submit" className="room-primary room-send-button" disabled={remoteBlocked || !file || tooLarge || invalidAudience}>
              <Send size={16} aria-hidden />
              {file && file === retryUpload ? (room.bulk ? "续传原文件" : "重试发送")
                : recipients !== null ? `发送给 ${recipients.length} 人` : `发给全区 ${activeMembers.length} 人`}
            </button>
            <p className="room-note">{room.bulk ? "单文件最多 20 GB。中断后可重选原文件续传。" : "单文件最多 64 MiB，校验成功后保留 24 小时。"}</p>
          </form>
        </section>
        <section className="room-card room-shared" aria-labelledby="room-files-heading">
          <h2 id="room-files-heading">共享文件</h2>
          <div className="room-file-filters" role="group" aria-label="共享文件筛选">
            <div className="room-file-search"><Search size={17} aria-hidden />
              <input type="search" aria-label="按文件名查找" placeholder="按文件名查找"
                value={fileQuery} onChange={event => setFileQuery(event.target.value)} />
            </div>
            <select aria-label="收发筛选" value={fileDirection} onChange={event => setFileDirection(event.target.value)}>
              <option value="all">全部文件</option>
              <option value="sent">我发出的</option>
              <option value="received">我收到的</option>
            </select>
          </div>
          {visibleFiles.length === 0 && <div className="room-file-empty">
            <FolderOpen size={25} aria-hidden />
            <p>{room.files.length ? "未找到符合条件的文件。" : "区内还没有文件。"}</p>
          </div>}
          {visibleFiles.map(item => {
            const sent = item.sender === room.member.id;
            const sender = roomMembers.get(item.sender);
            const ready = verified[item.id];
            const preparing = item.chunked && needsSaveClick && !ready;
            const wasHandedOff = Boolean(handedOff[item.id]);
            const receiving = transfer?.id === item.id ? transfer : null;
            return <article key={item.id} className="room-file">
              <div className="room-file-info">
                <RoomFileIcon name={item.name} file={ready ?? seedCopies[item.id]} />
                <div><strong>{item.name}</strong>
                  <p className="room-note room-identity"><RoomAvatar id={item.sender} slot={sender?.avatarSlot} /><span>{sent ? "我发送的"
                    : sender ? `发件人 ${sender.name}` : "发件人已离群"}</span></p>
                  <p className="room-note">{item.directed ? "指定收件人 · " : ""}{formatSize(item.size)} · 领取期限 {formatDate(item.expires)}</p>
                </div>
              </div>
              <div className="room-file-task">
                <div className="room-file-status" data-waiting={!sent && !wasHandedOff && !ready}>
                  {sent || wasHandedOff || ready ? <Check size={14} aria-hidden /> : <Clock3 size={14} aria-hidden />}
                  {receiving ? "领取中" : sent ? "已发送" : wasHandedOff ? "已交给浏览器保存" : ready ? "已校验，待保存" : "待领取"}
                </div>
                <div className="room-row room-file-actions">
                  <button className="room-download-button" disabled={busy || (stationOffline && !ready)} aria-label={`${preparing ? "准备保存" : "保存"} ${item.name}`} onClick={() => void perform(async () => {
                    if (item.chunked) {
                      if (ready) { saveFromBrowser(ready, item); return; }
                      const downloaded = await downloadBulk(roomApi + "/files/" + item.id, item, progress, peers.current?.download(item.id));
                      setVerified(state => ({ ...state, [item.id]: downloaded }));
                      if (needsSaveClick) setMessage("文件校验通过，请点击保存。");
                      else saveFromBrowser(downloaded, item);
                      return;
                    }
                    const response = await fetch(roomApi + "/files/" + item.id);
                    if (!response.ok) throw new Error(await response.json());
                    const body = await response.arrayBuffer();
                    if (body.byteLength !== item.size || await digest(body) !== item.digest) throw new Error("文件校验失败，未保存。");
                    saveFromBrowser(new Blob([body]), item);
                  }, ready ? null : { id: item.id, label: "准备下载", bytes: 0, total: item.size })}>
                    <ArrowDownToLine size={16} aria-hidden /> {ready ? "保存" : preparing ? "准备保存" : "下载"}
                  </button>
                  {peerEnabled && item.chunked && item.size > 0 && (seedCopies[item.id] || verified[item.id]) &&
                    <button className="room-quiet-action" disabled={busy || (stationOffline && !seeding.includes(item.id))} aria-label={`${seeding.includes(item.id) ? "停止供件" : "开始供件"} ${item.name}`}
                      onClick={() => void perform(async () => {
                        const active = seeding.includes(item.id);
                        await peers.current?.share(item.id, active ? null : seedCopies[item.id] ?? verified[item.id]);
                        setSeeding(current => active ? current.filter(id => id !== item.id) : [...current, item.id]);
                        setMessage(active ? "本设备已停止供件。" : "本设备在线时，可向区内成员供件。");
                      })}>{seeding.includes(item.id) ? "停止供件" : "开始供件"}</button>}
                  {(manage || item.sender === room.member.id) && <>
                    {item.expires < item.retain_until && <button className="room-quiet-action" disabled={remoteBlocked} onClick={() => {
                      const expires = item.expires + retentionHours(item.size) * day / 24;
                      if (window.confirm(`延至 ${formatDate(expires)}？`)) void perform(async () => {
                        await jsonPost(roomApi + "/extend", { id: item.id, expires });
                        await refresh(roomApi);
                      });
                    }}>延期</button>}
                    <button className="room-quiet-action" disabled={remoteBlocked} onClick={() => {
                      if (window.confirm(`撤回「${item.name}」？`)) void perform(async () => {
                        await jsonPost(roomApi + "/revoke", { id: item.id });
                        await refresh(roomApi);
                      });
                    }}>撤回</button>
                  </>}
                </div>
              </div>
              {receiving && <TransferMeter {...receiving} />}
            </article>;
          })}
        </section>
      </div>
      {room.fixed && <RoomChat key={room.code} code={room.code} />}
    </>}
  </main>;
}
