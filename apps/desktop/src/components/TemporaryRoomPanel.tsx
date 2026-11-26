import { QRCodeCanvas } from "qrcode.react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Shelf } from "../backend";
import { nativeWebReceiver, saveAcceptedWebFile } from "../webReceiveBackend";
import { nativeWebTransferSource } from "../webTransferBackend";
import { WEB_MAX_FILE_BYTES } from "../webFileRules";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { TransferSelection } from "./TransferPanel";

type FileEntry = { id: string; name: string; sender?: string; size: number; digest: string; expires: number; chunked?: number };
type MemberRole = "owner" | "admin" | "member";
type RoomMember = { id: string; name: string; status: "active" | "pending"; role?: MemberRole };
type Room = { member: { id?: string; name: string; role?: MemberRole }; members?: RoomMember[]; files: FileEntry[]; memberLimit?: number; bulk?: boolean };
type Admission = "pending" | "denied" | "left" | "removed";
type RoomView = Room | { status: Admission };
const admissionText: Record<Admission, string> = {
  pending: "等待批准，获批后会自动进入。",
  denied: "加入申请未获批准。",
  left: "你已退出文件群，可使用邀请重新加入。",
  removed: "你已被移出这个文件群。",
};
const memberRoleText: Record<MemberRole, string> = { owner: "群主", admin: "管理员", member: "成员" };
type CreatedRoom = { invitation: string; recovery: string };
type StationView = { available: boolean; running: boolean; folder: string | null; quota_mib: number; address: string | null };
export type RoomSession = { link: string; name: string; station: string; recovery: string; room: Room | null; admission: Admission | null; shelf: number; saved: Record<string, string> };

export function TemporaryRoomPanel({ selection, shelves, session, setSession, chooseReceiveFolder, returnToShelf }: {
  selection: TransferSelection;
  shelves: Shelf[];
  session: RoomSession;
  setSession: Dispatch<SetStateAction<RoomSession>>;
  chooseReceiveFolder?: () => Promise<number | null>;
  returnToShelf: () => void;
}) {
  const { link, name, station, recovery, room, admission, saved } = session;
  const [approval, setApproval] = useState(true);
  const [entry, setEntry] = useState<"join" | "create">("join");
  const [changingRoom, setChangingRoom] = useState(false);
  const [draftLink, setDraftLink] = useState(link);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [departure, setDeparture] = useState<{ invitation: string; member?: RoomMember } | null>(null);
  const [host, setHost] = useState<StationView>();
  const [quota, setQuota] = useState(512);
  const hostPanel = useRef<HTMLDetailsElement>(null);
  const hostRunning = host?.running === true;
  const invitation = link.trim();
  const inviteUrl = URL.canParse(invitation) ? new URL(invitation) : null;
  const mobileInvite = inviteUrl?.protocol === "https:"
    && !/^(?:(?:.+\.)?localhost\.?$|127\.|\[::1\]$)/i.test(inviteUrl.hostname);
  const shelf = shelves.some(item => item.id === session.shelf) ? session.shelf : 0;
  const pending = room?.members?.filter(member => member.status === "pending") ?? [];
  const activeMembers = room?.members?.filter(member => member.status === "active") ?? [];
  const senderNames = new Map(activeMembers.map(member => [member.id, member.name]));
  const memberLimit = room?.memberLimit;
  const roomFull = memberLimit !== undefined && activeMembers.length >= memberLimit;
  const owner = room?.member.role === "owner";
  const managesRoom = owner || room?.member.role === "admin";
  const confirmingDeparture = departure?.invitation === invitation ? departure : null;
  const selected = selection.files.length === 1 ? selection.files[0] : null;

  useEffect(() => {
    let active = true;
    void invoke<StationView>("room_station_view").then(view => {
      if (active && view) { setHost(view); setQuota(view.quota_mib); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hostRunning || busy) return;
    let active = true;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void invoke<StationView>("room_station_view").then(view => {
        if (active && view && !view.running) {
          setHost(view);
          setFailed(true);
          setReport("本机站点已退出，可重新启动后继续使用。");
        }
      }).catch(() => undefined);
    }, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [hostRunning, busy]);

  function selectShelf(target: number) {
    setSession(current => ({ ...current, shelf: target, saved: {} }));
  }

  const applyView = useCallback((target: string, view: RoomView) => {
    setSession(current => {
      if (current.link.trim() !== target) return current;
      return "status" in view
        ? { ...current, room: null, admission: view.status }
        : { ...current, room: view, admission: null };
    });
    setOffline(false);
  }, [setSession]);

  async function refresh(target = invitation) {
    try {
      const view = await invoke<RoomView>("room_view", { invitation: target });
      applyView(target, view);
      if (!("status" in view)) setChangingRoom(false);
    } catch (error) {
      if (target === invitation && room) setOffline(true);
      throw error;
    }
  }

  useEffect(() => {
    if (!invitation || (admission && admission !== "pending") || busy || changingRoom) return;
    let timer: number;
    let disposed = false;
    let running = false;
    const update = async () => {
      if (disposed || running || document.hidden) return;
      running = true;
      try {
        const view = await invoke<RoomView>("room_view", { invitation });
        if (!disposed && !document.hidden) applyView(invitation, view);
      } catch {
        if (!disposed && !document.hidden) setOffline(true);
      } finally {
        running = false;
        if (!disposed && !document.hidden) timer = window.setTimeout(update, 2000);
      }
    };
    const visibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) void update();
    };
    timer = window.setTimeout(update, 2000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [admission, applyView, busy, changingRoom, invitation]);

  async function createRoom() {
    const created = await invoke<CreatedRoom>("room_create", { station: station.trim(), name, approval });
    setSession(current => ({ ...current, link: created.invitation, recovery: created.recovery, room: null, admission: null, saved: {} }));
    setDraftLink(created.invitation);
    setEntry("join");
    await refresh(created.invitation);
    setReport("已创建互传区，可以复制邀请链接。");
  }

  async function copy(value: string, label: string) {
    await run(async () => {
      try {
        await navigator.clipboard.writeText(value);
        setReport(`已复制${label}。`);
      } catch {
        throw new Error(`无法复制${label}，请选中文本手动复制。`);
      }
    });
  }

  async function startStation() {
    const view = await invoke<StationView>("room_station_start", { quotaMib: quota });
    setHost(view);
    const address = view.address;
    if (address) {
      setSession(current => ({ ...current, station: address }));
      setEntry("create");
      if (!room && hostPanel.current) hostPanel.current.open = false;
      setReport(room ? "本机站点已恢复。换区可使用本机站点创建新区。" : "本机站点已启动。填写显示名称后即可创建互传区。");
    }
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    setReport("");
    try { await task(); }
    catch (error) {
      setFailed(true);
      setReport(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function depart(member?: RoomMember) {
    await run(async () => {
      await invoke("room_depart", { invitation, memberId: member?.id ?? null });
      if (!member) {
        setDraftLink(invitation);
        setEntry("join");
      }
      await refresh();
    });
  }

  function progressChannel() {
    const channel = new Channel<{ phase: string; bytes: number; total: number }>();
    channel.onmessage = ({ phase, bytes, total }) => {
      setReport(`${phase} ${(bytes / 1024 ** 2).toFixed(1)} / ${(total / 1024 ** 2).toFixed(1)} MiB`);
    };
    return channel;
  }

  async function sendSelected() {
    const item = selection.files[0];
    if (!item || selection.files.length !== 1) return;
    if (room?.bulk) {
      const url = new URL(invitation);
      const key = JSON.stringify(["room-bulk-upload", url.origin, url.searchParams.get("code"), selection.shelf_id, item.id]);
      const uploadId = localStorage.getItem(key) ?? crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(key, uploadId);
      await invoke("room_bulk_upload", { invitation, shelfId: selection.shelf_id, itemId: item.id, uploadId, onProgress: progressChannel() });
      localStorage.removeItem(key);
      setReport("文件已发到临时互传区。");
      return;
    }
    const prepared = await nativeWebTransferSource.prepare(selection.shelf_id, item.id);
    try {
      const key = JSON.stringify(["room-upload", new URL(invitation).origin,
        new URL(invitation).searchParams.get("code"), item.id, prepared.sha256]);
      const uploadId = localStorage.getItem(key) ?? crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(key, uploadId);
      await invoke("room_upload", { invitation, ticket: prepared.ticket, uploadId, expected: prepared.sha256 });
      localStorage.removeItem(key);
      setReport("文件已发到临时互传区。");
    } finally {
      await nativeWebTransferSource.release(prepared.ticket).catch(() => undefined);
    }
  }

  async function saveFile(file: FileEntry) {
    const key = JSON.stringify(["room-download", new URL(invitation).origin,
      new URL(invitation).searchParams.get("code"), shelf, file.id]);
    const existing = localStorage.getItem(key);
    if (existing) {
      rememberSaved(file.id, existing === "pending" ? "未确认，请先到目标文件架核对" : existing);
      return;
    }
    const receipt = await (async () => {
      if (file.chunked) {
        const ticket = crypto.randomUUID();
        await invoke("room_bulk_receive", { invitation, fileId: file.id, shelfId: shelf, ticket, onProgress: progressChannel() });
        try {
          setReport("校验通过，正在写入绑定目录…");
          localStorage.setItem(key, "pending");
          return await nativeWebReceiver.finish(ticket);
        } catch (error) {
          await nativeWebReceiver.abort(ticket).catch(() => undefined);
          throw error;
        }
      }
      const bytes = await invoke<ArrayBuffer>("room_download", { invitation, fileId: file.id });
      return saveAcceptedWebFile(shelf, {
        manifest: { id: file.id, name: file.name, size: file.size, mime: "application/octet-stream", sha256: file.digest },
        bytes,
      }, undefined, () => localStorage.setItem(key, "pending"));
    })();
    localStorage.setItem(key, receipt.file_name);
    rememberSaved(file.id, receipt.file_name);
    setReport("");
  }

  function rememberSaved(id: string, filename: string) {
    setSession(current => current.link.trim() === invitation && current.shelf === shelf
      ? { ...current, saved: { ...current.saved, [id]: filename } } : current);
  }

  return <section className="room-desktop" aria-label="临时互传区">
    {offline && !changingRoom && <p className="room-caption" role="status">站点暂时无法连接，恢复后自动更新。</p>}
    {host?.available && <details ref={hostPanel} className="room-desktop-card room-station">
      <summary>本机互传站点 <span>{host.running ? "运行中" : "已停止"}</span></summary>
      <div className="transfer-form">
        <p className="room-caption">仅供这台电脑上的软件和网页使用。停站后，访客要等站点重启才能继续访问。</p>
        <label>暂存位置<Input readOnly value={host.folder ?? ""} placeholder="请选择暂存位置"
          onFocus={event => event.target.select()} /></label>
        <label>文件暂存配额<select value={quota} disabled={busy || host.running} onChange={event => setQuota(Number(event.target.value))}>
          <option value={512}>512 MiB</option>
          <option value={2048}>2 GiB</option>
          <option value={8192}>8 GiB</option>
          <option value={20480}>20 GiB</option>
        </select></label>
        {host.address && <label>本机访问地址<Input readOnly value={host.address}
          onFocus={event => event.target.select()} /></label>}
        <div className="transfer-receive-actions">
          {host.running ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => {
            setHost(await invoke<StationView>("room_station_stop"));
            setReport("本机站点已停止，暂存文件仍按有效期保留。");
          })}>停止站点</Button> : <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => {
              setHost(await invoke<StationView>("room_station_choose"));
            })}>选择暂存位置</Button>
            <Button size="sm" disabled={busy || !host.folder} onClick={() => void run(startStation)}>启动站点</Button>
          </>}
        </div>
      </div>
    </details>}
    {!room || changingRoom ? <div className="room-desktop-card transfer-form">
      <div className="room-desktop-heading">
        <h3>{room ? "切换互传区" : "开始互传"}</h3>
        {room && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChangingRoom(false)}>返回当前互传区</Button>}
      </div>
      {admission && !changingRoom && <p className="room-caption" role="status">
        {admissionText[admission]}
      </p>}
      <div className="room-entry" role="group" aria-label="进入方式">
        <Button size="sm" variant={entry === "join" ? "secondary" : "ghost"} aria-pressed={entry === "join"}
          disabled={busy} onClick={() => setEntry("join")}>有邀请链接</Button>
        <Button size="sm" variant={entry === "create" ? "secondary" : "ghost"} aria-pressed={entry === "create"}
          disabled={busy} onClick={() => setEntry("create")}>发起新区</Button>
      </div>
      {entry === "join" ? <label>邀请链接<Input disabled={busy} value={draftLink} placeholder="粘贴对方发来的邀请链接" onChange={event => {
        setDraftLink(event.target.value); setReport("");
      }} /></label> : <label>互传站点地址<Input disabled={busy} value={station} placeholder="粘贴自托管站点的 HTTPS 地址" onChange={event => {
        const next = event.target.value;
        setSession(current => ({ ...current, station: next }));
      }} /></label>}
      <label>显示名称<Input disabled={busy} value={name} maxLength={100} onChange={event => {
        const next = event.target.value;
        setSession(current => ({ ...current, name: next }));
      }} /></label>
      {entry === "create" && <label className="transfer-room-approval">
        <input type="checkbox" checked={approval} disabled={busy} onChange={event => setApproval(event.target.checked)} />
        入区需批准
      </label>}
      <div className="transfer-receive-actions">
        {entry === "create" ? <Button disabled={busy || !station.trim() || !name.trim()}
          onClick={() => void run(createRoom)}>创建互传区</Button> : <Button disabled={busy || !draftLink.trim() || !name.trim() || (admission === "pending" && draftLink.trim() === invitation)}
          onClick={() => void run(async () => {
            const target = draftLink.trim();
            await invoke("room_join", { invitation: target, name });
            if (target !== invitation) {
              setSession(current => ({ ...current, link: target, room: null, recovery: "", admission: null, saved: {} }));
            }
            setChangingRoom(false);
            await refresh(target);
          })}>加入互传区</Button>}
        {entry === "join" && invitation && draftLink.trim() === invitation && <Button variant="outline" disabled={busy}
          onClick={() => void run(refresh)}>刷新互传区</Button>}
        {entry === "join" && recovery && draftLink.trim() === invitation && <Button variant="outline" disabled={busy}
          onClick={() => void copy(invitation, "邀请链接")}>复制邀请链接</Button>}
      </div>
    </div> : <>
      <div className="room-desktop-card transfer-form">
        <div className="room-desktop-heading">
          <h3>{room.member.name}</h3>
          <span>{memberRoleText[room.member.role ?? "member"]}</span>
        </div>
        <label>邀请链接<Input readOnly value={link} onFocus={event => event.target.select()} /></label>
        <p className="room-caption">{mobileInvite ? "通过 HTTPS 站点互传" : "通过本机站点互传"}</p>
        <div className="transfer-receive-actions">
          <Button variant="outline" size="sm" disabled={busy} aria-label="复制邀请链接"
            onClick={() => void copy(invitation, "邀请链接")}>复制邀请</Button>
          <Button variant="ghost" size="sm" disabled={busy} aria-label="刷新互传区"
            onClick={() => void run(refresh)}>刷新</Button>
          <Button variant="ghost" size="sm" disabled={busy} aria-label="切换互传区" onClick={() => {
            setDeparture(null);
            setDraftLink("");
            setEntry("join");
            setChangingRoom(true);
          }}>切换</Button>
        </div>
        <details className="room-recovery" key={invitation}>
          <summary>手机扫码加入</summary>
          <div className="transfer-form">
            {mobileInvite ? <>
              <QRCodeCanvas value={invitation} size={192} marginSize={4} role="img" aria-label="互传区邀请二维码" />
              <p className="room-caption">用手机相机扫码，打开邀请后申请加入。</p>
            </> : <p className="room-caption">这个地址供当前电脑使用。请用手机可访问的 HTTPS 站点创建互传区。</p>}
          </div>
        </details>
        {recovery && <details className="room-recovery">
          <summary>管理恢复码</summary>
          <div className="transfer-form">
            <label>管理恢复码<Input readOnly value={recovery} onFocus={event => event.target.select()} /></label>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void copy(recovery, "管理恢复码")}>复制管理恢复码</Button>
          </div>
        </details>}
        {memberLimit !== undefined && <details className="room-recovery">
          <summary>文件群成员 {activeMembers.length} / {memberLimit} 人</summary>
          <ul className="transfer-form">
            {activeMembers.map(member => <li className="room-person" key={member.id}>
              <span>{member.name} <small className="room-caption">{memberRoleText[member.role ?? "member"]}</small></span>
              {managesRoom && member.id !== room.member.id && (member.role === "member" || (member.role === "admin" && owner)) &&
                <Button size="sm" variant="ghost" disabled={busy || offline} aria-label={`移出 ${member.name}`}
                  onClick={() => setDeparture({ invitation, member })}>移出</Button>}
            </li>)}
            {!owner && <li><Button size="sm" variant="ghost" disabled={busy || offline}
              onClick={() => setDeparture({ invitation })}>退出文件群</Button></li>}
          </ul>
        </details>}
        {confirmingDeparture && <div className="transfer-form" role="group" aria-label="确认成员变更">
          <p>{confirmingDeparture.member ? `将「${confirmingDeparture.member.name}」移出文件群？` : "退出这个文件群？"}</p>
          <div className="transfer-receive-actions">
            <Button size="sm" variant="outline" onClick={() => setDeparture(null)}>取消</Button>
            <Button size="sm" variant="destructive" disabled={busy || offline} onClick={() => {
              setDeparture(null);
              void depart(confirmingDeparture.member);
            }}>{confirmingDeparture.member ? "确认移出" : "确认退出"}</Button>
          </div>
        </div>}
      </div>
      {!!pending.length && <div className="room-desktop-card transfer-form">
        <h3>待批准访客</h3>
        {roomFull && <p className="room-caption">文件群已满，有空位后可批准加入。</p>}
        {pending.map(member => <div className="room-person" key={member.id}>
          <span>{member.name}</span>
          <div className="transfer-receive-actions">
            {[true, false].map(accept => {
              const label = accept ? "批准" : "拒绝";
              return <Button key={label} size="sm" variant="outline" disabled={busy || offline || (accept && roomFull)} aria-label={`${label} ${member.name}`}
                onClick={() => void run(async () => {
                  await invoke("room_decide", { invitation, memberId: member.id, accept });
                  await refresh();
                })}>{label}</Button>;
            })}
          </div>
        </div>)}
      </div>}
      <div className="room-desktop-card transfer-form">
        <h3>发送文件</h3>
        {selected ? <p className="room-selected" title={selected.name}>{selected.name}</p> :
          <p className="room-caption">{selection.files.length > 1 ? "请选择一个文件发送。" : "请在文件架选择一个文件。"}</p>}
        <div className="transfer-receive-actions">
          {selected && <Button disabled={busy || offline} onClick={() => void run(async () => {
            await sendSelected(); await refresh();
          })}>将所选文件发给全区</Button>}
          <Button variant={selected ? "ghost" : "outline"} disabled={busy} onClick={returnToShelf}>
            {selected ? "更换文件" : "返回文件架选文件"}
          </Button>
        </div>
        <p className="room-caption">单文件最多 {room.bulk ? "20 GB" : "64 MiB"}</p>
      </div>
      <div className="room-desktop-card transfer-form">
        <h3>接收文件</h3>
        <label>保存到<select aria-label="保存到" disabled={busy} value={shelf}
          onChange={event => selectShelf(Number(event.target.value))}>
          <option value={0}>选择绑定目录</option>
          {shelves.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {chooseReceiveFolder && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
          const target = await chooseReceiveFolder();
          if (target !== null) selectShelf(target);
        })}>{shelf ? "更换保存文件夹" : "选择保存文件夹"}</Button>}
        {room.files.length === 0 ? <p className="room-caption">区内还没有文件。</p> :
          <ul className="room-file-list" aria-label="区内文件">{room.files.map(file => <li key={file.id}>
            <div className="room-file-name">
              <strong title={file.name}>{file.name}</strong>
              {file.sender && <small>{file.sender === room.member.id ? "我发送的"
                : senderNames.has(file.sender) ? `发件人 ${senderNames.get(file.sender)}`
                  : room.members ? "发件人已离群" : "发件人未显示"}</small>}
              <small>{file.size.toLocaleString()} B</small>
            </div>
            {!file.chunked && file.size > WEB_MAX_FILE_BYTES ? <small>请在网页领取</small>
              : saved[file.id] ? <small className="room-saved">{saved[file.id]}</small>
              : <Button size="sm" variant="outline" disabled={busy || offline || !shelf} aria-label={`保存 ${file.name}`}
                onClick={() => void run(() => saveFile(file))}>保存</Button>}
          </li>)}</ul>}
      </div>
    </>}
    {(report || busy) && <p className="room-desktop-feedback" role={failed ? "alert" : "status"}>{report || "处理中…"}</p>}
  </section>;
}
