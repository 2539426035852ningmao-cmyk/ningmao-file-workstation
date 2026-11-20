import { Channel, invoke } from "@tauri-apps/api/core";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { Shelf } from "../backend";
import { nativeWebReceiver, saveAcceptedWebFile } from "../webReceiveBackend";
import { nativeWebTransferSource } from "../webTransferBackend";
import { WEB_MAX_FILE_BYTES } from "../webFileRules";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { TransferSelection } from "./TransferPanel";

type FileEntry = { id: string; name: string; size: number; digest: string; expires: number; chunked?: number };
type RoomMember = { id: string; name: string; status: "active" | "pending" };
type Room = { member: { name: string }; members?: RoomMember[]; files: FileEntry[]; bulk?: boolean };
type RoomView = Room | { status: "pending" | "denied" };
type CreatedRoom = { invitation: string; recovery: string };
export type RoomSession = { link: string; name: string; station: string; recovery: string };

export function TemporaryRoomPanel({ selection, shelves, session, setSession }: {
  selection: TransferSelection;
  shelves: Shelf[];
  session: RoomSession;
  setSession: Dispatch<SetStateAction<RoomSession>>;
}) {
  const { link, name, station, recovery } = session;
  const [approval, setApproval] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [shelf, setShelf] = useState(0);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const invitation = link.trim();

  async function refresh(target = invitation) {
    const view = await invoke<RoomView>("room_view", { invitation: target });
    if ("status" in view) {
      setRoom(null);
      setReport(view.status === "pending" ? "等待群主或管理员批准。批准后点击刷新。" : "加入申请未获批准。");
    } else {
      setRoom(view);
    }
  }

  async function createRoom() {
    const created = await invoke<CreatedRoom>("room_create", { station: station.trim(), name, approval });
    setSession(current => ({ ...current, link: created.invitation, recovery: created.recovery }));
    setSaved({});
    setRoom(null);
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
      setSaved(value => ({ ...value, [file.id]: existing === "pending" ? "未确认，请先到目标文件架核对" : existing }));
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
    setSaved(value => ({ ...value, [file.id]: receipt.file_name }));
    setReport("");
  }

  return <details className="transfer-experiment">
    <summary>临时互传区</summary>
    <div className="transfer-form">
      <label>邀请链接<Input disabled={busy} value={link} onChange={event => {
        const next = event.target.value;
        setSession(current => ({ ...current, link: next, recovery: "" }));
        setRoom(null); setSaved({}); setReport("");
      }} /></label>
      <label>显示名称<Input disabled={busy} value={name} maxLength={100} onChange={event => {
        const next = event.target.value;
        setSession(current => ({ ...current, name: next }));
      }} /></label>
      <div className="transfer-receive-actions">
        <Button disabled={busy || !invitation || !name.trim()} onClick={() => void run(async () => {
          await invoke("room_join", { invitation, name }); await refresh();
        })}>加入互传区</Button>
        <Button variant="outline" disabled={busy || !invitation} onClick={() => void run(refresh)}>刷新互传区</Button>
        {(room || recovery) && <Button variant="outline" disabled={busy}
          onClick={() => void copy(invitation, "邀请链接")}>复制邀请链接</Button>}
      </div>
      <details className="transfer-experiment">
        <summary>发起临时互传区</summary>
        <div className="transfer-form">
          <label>互传站点地址<Input disabled={busy} value={station} placeholder="粘贴自托管站点的 HTTPS 地址"
            onChange={event => {
              const next = event.target.value;
              setSession(current => ({ ...current, station: next }));
            }} /></label>
          <label className="transfer-room-approval">
            <input type="checkbox" checked={approval} disabled={busy} onChange={event => setApproval(event.target.checked)} />
            入区需批准
          </label>
          <div className="transfer-receive-actions">
            <Button disabled={busy || !station.trim() || !name.trim()}
              onClick={() => void run(createRoom)}>创建互传区</Button>
          </div>
        </div>
      </details>
      {recovery && <details className="transfer-experiment">
        <summary>保存管理恢复码</summary>
        <div className="transfer-form">
          <label>管理恢复码<Input readOnly value={recovery} /></label>
          <div className="transfer-receive-actions">
            <Button variant="outline" disabled={busy} onClick={() => void copy(recovery, "管理恢复码")}>复制管理恢复码</Button>
          </div>
        </div>
      </details>}
      {room && <>
        <p className="transfer-note">已加入（{room.member.name}）</p>
        {room.members?.filter(member => member.status === "pending").map(member => <div className="transfer-receive-actions" key={member.id}>
          <span>{member.name}</span>
          {[true, false].map(accept => {
            const label = accept ? "批准" : "拒绝";
            return <Button key={label} variant="outline" disabled={busy} aria-label={`${label} ${member.name}`}
              onClick={() => void run(async () => {
                await invoke("room_decide", { invitation, memberId: member.id, accept });
                await refresh();
              })}>{label}</Button>;
          })}
        </div>)}
        <Button disabled={busy || selection.files.length !== 1} onClick={() => void run(async () => {
          await sendSelected(); await refresh();
        })}>将所选文件发给全区</Button>
        <p className="transfer-note">每次发送一个文件，最多 {room.bulk ? "20 GB" : "64 MiB"}。</p>
        <label>保存到<select aria-label="保存到" disabled={busy} value={shelf} onChange={event => { setShelf(Number(event.target.value)); setSaved({}); }}>
          <option value={0}>选择绑定目录</option>
          {shelves.filter(item => item.kind === "bound" && item.available).map(item =>
            <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {room.files.length === 0 && <p className="transfer-note">区内还没有文件。</p>}
        <ul className="transfer-files">{room.files.map(file => <li key={file.id}>
          <div><strong>{file.name}</strong><small> · {file.size.toLocaleString()} B</small></div>
          {!file.chunked && file.size > WEB_MAX_FILE_BYTES ? <small>超过 64 MiB，请在网页领取</small>
            : saved[file.id] ? <small>{saved[file.id]}</small>
            : <Button variant="outline" disabled={busy || !shelf} aria-label={`保存 ${file.name}`}
              onClick={() => void run(() => saveFile(file))}>保存</Button>}
        </li>)}</ul>
      </>}
      {busy && !report && <p role="status">处理中…</p>}
      {report && <p role={failed ? "alert" : "status"}>{report}</p>}
    </div>
  </details>;
}
