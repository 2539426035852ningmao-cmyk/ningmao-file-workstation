import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { Shelf } from "../backend";
import { saveAcceptedWebFile } from "../webReceiveBackend";
import { nativeWebTransferSource } from "../webTransferBackend";
import { WEB_MAX_FILE_BYTES } from "../webFileRules";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { TransferSelection } from "./TransferPanel";

type FileEntry = { id: string; name: string; size: number; digest: string; expires: number };
type Room = { member: { name: string }; files: FileEntry[] };
type RoomView = Room | { status: "pending" | "denied" };

export function TemporaryRoomPanel({ selection, shelves }: { selection: TransferSelection; shelves: Shelf[] }) {
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [shelf, setShelf] = useState(0);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const invitation = link.trim();

  async function refresh() {
    const view = await invoke<RoomView>("room_view", { invitation });
    if ("status" in view) {
      setRoom(null);
      setReport(view.status === "pending" ? "等待群主或管理员批准。批准后点击刷新。" : "加入申请未获批准。");
    } else {
      setRoom(view);
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

  async function sendSelected() {
    const item = selection.files[0];
    if (!item || selection.files.length !== 1) return;
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
    const bytes = await invoke<ArrayBuffer>("room_download", { invitation, fileId: file.id });
    const receipt = await saveAcceptedWebFile(shelf, {
      manifest: { id: file.id, name: file.name, size: file.size, mime: "application/octet-stream", sha256: file.digest },
      bytes,
    }, undefined, () => localStorage.setItem(key, "pending"));
    localStorage.setItem(key, receipt.file_name);
    setSaved(value => ({ ...value, [file.id]: receipt.file_name }));
  }

  return <details className="transfer-experiment">
    <summary>临时互传区</summary>
    <div className="transfer-form">
      <label>邀请链接<Input disabled={busy} value={link} onChange={event => {
        setLink(event.target.value); setRoom(null); setSaved({}); setReport("");
      }} /></label>
      <label>显示名称<Input disabled={busy} value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
      <div className="transfer-receive-actions">
        <Button disabled={busy || !invitation || !name.trim()} onClick={() => void run(async () => {
          await invoke("room_join", { invitation, name }); await refresh();
        })}>加入互传区</Button>
        <Button variant="outline" disabled={busy || !invitation} onClick={() => void run(refresh)}>刷新互传区</Button>
      </div>
      {room && <>
        <p className="transfer-note">已加入 · {room.member.name}</p>
        <Button disabled={busy || selection.files.length !== 1} onClick={() => void run(async () => {
          await sendSelected(); await refresh();
        })}>将所选文件发给全区</Button>
        <p className="transfer-note">每次发送一个文件，最多 64 MiB。</p>
        <label>保存到<select aria-label="保存到" disabled={busy} value={shelf} onChange={event => { setShelf(Number(event.target.value)); setSaved({}); }}>
          <option value={0}>选择绑定目录</option>
          {shelves.filter(item => item.kind === "bound" && item.available).map(item =>
            <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {room.files.length === 0 && <p className="transfer-note">区内还没有文件。</p>}
        <ul className="transfer-files">{room.files.map(file => <li key={file.id}>
          <div><strong>{file.name}</strong><small>{file.size.toLocaleString()} B</small></div>
          {file.size > WEB_MAX_FILE_BYTES ? <small>超过 64 MiB，请在网页领取</small>
            : saved[file.id] ? <small>{saved[file.id]}</small>
            : <Button variant="outline" disabled={busy || !shelf}
              onClick={() => void run(() => saveFile(file))}>保存</Button>}
        </li>)}</ul>
      </>}
      {busy && <p role="status">处理中…</p>}
      {report && <p role={failed ? "alert" : "status"}>{report}</p>}
    </div>
  </details>;
}
