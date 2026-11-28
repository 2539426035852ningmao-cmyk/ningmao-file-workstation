import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { StationSocialPanel } from "./StationSocialPanel";

type AccountView = { username: string | null; station: string | null; saved_station?: string | null;
  saved_username?: string | null; can_associate: boolean };
export type RoomAccount = { username: string; station: string };

export function StationAccountPanel({ initiallyOpen, defaultStation, onGuest, onAccount, openRoom, onLocalStation }: {
  initiallyOpen?: boolean;
  defaultStation: string;
  onGuest: (station: string) => void;
  onAccount: (account: RoomAccount | null) => void;
  openRoom: (link: string) => Promise<void>;
  onLocalStation?: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const [view, setView] = useState<AccountView>();
  const [register, setRegister] = useState(false);
  const [editedStation, editStation] = useState<string>();
  const [status, setStatus] = useState<"checking" | "ready" | "expired" | "offline">("checking");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const address = editedStation ?? (view?.station || defaultStation || view?.saved_station || "");

  useEffect(() => {
    if (initiallyOpen && details.current) details.current.open = true;
  }, [initiallyOpen]);

  async function load(isActive = () => true) {
    setError("");
    setStatus("checking");
    try {
      const profile = await invoke<AccountView>("station_account_view");
      if (!isActive() || !profile) return;
      setView(profile);
      if (!profile.station || !profile.username) {
        onAccount(null);
        setStatus("ready");
        return;
      }
      try {
        const username = await invoke<string | null>("station_account_check");
        if (!isActive()) return;
        if (username) {
          setView({ ...profile, username });
          onAccount({ username, station: profile.station });
          setStatus("ready");
        } else {
          onAccount(null);
          setStatus("expired");
        }
      } catch {
        if (!isActive()) return;
        onAccount(null);
        setStatus("offline");
      }
    } catch (failure) {
      if (isActive()) setError(String(failure));
    }
  }

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [onAccount]);

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (register && data.get("repeat") !== password) {
      setError("两次输入的密码不一致。");
      return;
    }
    setError("");
    setNotice("");
    setBusy(view?.username ? "正在登录…" : "正在登录并打开工作区…");
    try {
      await invoke("station_account_login", {
        station: address.trim(), username: String(data.get("username") ?? ""), password,
        register, associate: data.get("workspace") === "associate",
      });
      if (view?.username) {
        form.reset();
        setBusy("");
        await load();
      }
    } catch (failure) {
      setError(String(failure));
      setBusy("");
    }
  }

  async function openBrowser() {
    setError("");
    setNotice("");
    setBusy("正在打开浏览器…");
    try {
      await invoke("station_open_browser", { station: address.trim() });
      setNotice("已请求打开默认浏览器。");
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy("");
    }
  }

  function switchEntry(next: boolean) {
    setRegister(next);
    setError("");
    setNotice("");
  }

  return <details ref={details} className="room-desktop-card room-station" onToggle={event => {
    if (event.currentTarget.open && view?.username && status === "offline") void load();
  }}>
    <summary>站点账号{view && <span>{view.username ?? "游客"}</span>}</summary>
    <div className="transfer-form">
      {error && <p role="alert">{error}</p>}
      {(busy || notice) && <p className="room-caption" role="status">{busy || notice}</p>}
      {status === "offline" && <p className="room-caption" role="status">站点暂时无法连接，本机工作区可继续使用。</p>}
      {status === "expired" && <p className="room-caption" role="status">会话已失效，请重新登录当前账号。</p>}
      {view && (!view.username || status === "expired") && <>
        {!view.username && <div className="room-entry" role="group" aria-label="账号入口">
          <Button type="button" size="sm" variant={register ? "ghost" : "secondary"} aria-pressed={!register}
            disabled={!!busy} onClick={() => switchEntry(false)}>登录</Button>
          <Button type="button" size="sm" variant={register ? "secondary" : "ghost"} aria-pressed={register}
            disabled={!!busy} onClick={() => switchEntry(true)}>创建账号</Button>
          <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => {
            onGuest(address.trim());
            if (details.current) details.current.open = false;
          }}>以游客继续</Button>
        </div>}
        <form key={String(register)} className="transfer-form" onSubmit={event => void enter(event)}>
          <label>账号站点<Input name="station" value={address} onChange={event => editStation(event.target.value)}
            placeholder="自建互传站点的 HTTPS 地址" readOnly={!!view.username} disabled={!!busy} required /></label>
          <label>账号名<Input name="username" defaultValue={register ? "" : view.username ?? view.saved_username ?? ""}
            autoComplete="username" disabled={!!busy} maxLength={64} required /></label>
          <label>密码<Input name="password" type="password" autoComplete={register ? "new-password" : "current-password"}
            disabled={!!busy} maxLength={256} required /></label>
          {register && <>
            <label>再输入一次密码<Input name="repeat" type="password" autoComplete="new-password" disabled={!!busy} maxLength={256} required /></label>
            <p className="room-caption">账号名 2 到 32 个字符，密码 15 到 128 个字符。</p>
          </>}
          {view.can_associate && <label>本机工作区<select name="workspace" defaultValue="separate" disabled={!!busy}>
            <option value="separate">使用此账号的独立工作区</option>
            <option value="associate">关联现有工作区</option>
          </select></label>}
          <div className="transfer-receive-actions">
            <Button type="submit" size="sm" disabled={!!busy}>{register ? "创建并登录" : view.username ? "重新登录" : "登录并切换工作区"}</Button>
            {!view.username && <Button type="button" variant="outline" size="sm" disabled={!!busy || !address.trim()}
              onClick={() => void openBrowser()}>打开网页版</Button>}
            {onLocalStation && !address.trim() && <Button type="button" size="sm" variant="ghost"
              disabled={!!busy} onClick={onLocalStation}>设置本机站点</Button>}
          </div>
        </form>
      </>}
      {view?.username && <>
        {status === "ready" && view.station && <StationSocialPanel station={view.station} openRoom={openRoom} />}
        <div className="transfer-receive-actions">
          {status === "ready" && <Button type="button" variant="outline" size="sm" disabled={!!busy}
            onClick={() => void openBrowser()}>打开网页版</Button>}
          {status === "offline" && <Button type="button" variant="outline" size="sm" disabled={!!busy}
            onClick={() => void load()}>重新连接</Button>}
          <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={async () => {
            setError("");
            setNotice("");
            setBusy("正在切换至游客工作区…");
            try { await invoke("station_account_logout"); }
            catch (failure) { setError(String(failure)); setBusy(""); }
          }}>退出至游客</Button>
        </div>
      </>}
      {!view && (error ? <Button type="button" variant="outline" size="sm" onClick={() => void load()}>重新检查</Button>
        : <p className="room-caption" role="status">正在检查本机账号…</p>)}
    </div>
  </details>;
}
