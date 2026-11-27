import { invoke } from "@tauri-apps/api/core";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { StationSocialPanel } from "./StationSocialPanel";

type AccountView = { username: string | null; station: string | null; can_associate: boolean };

export function StationAccountPanel({ defaultStation, openRoom }: { defaultStation: string; openRoom: (link: string) => Promise<void> }) {
  const [view, setView] = useState<AccountView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function load() {
    setError("");
    void invoke<AccountView>("station_account_view").then(setView).catch(failure => setError(String(failure)));
  }

  async function restart(command: "station_account_login" | "station_account_logout", args?: Record<string, string | boolean>) {
    setError("");
    setBusy(true);
    try {
      await invoke(command, args);
    } catch (failure) {
      setError(String(failure));
      setBusy(false);
    }
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void restart("station_account_login", {
      station: String(data.get("station") ?? "").trim(),
      username: String(data.get("username") ?? ""),
      password: String(data.get("password") ?? ""),
      associate: data.get("workspace") === "associate",
    });
  }

  return <details className="room-desktop-card room-station" onToggle={event => {
    if (event.currentTarget.open && !view) load();
  }}>
    <summary>站点账号{view?.username && <span>{view.username}</span>}</summary>
    {error && <p role="alert">{error}</p>}
    {busy && <p className="room-caption" role="status">正在切换工作区…</p>}
    {view?.username ? <div className="transfer-form">
      <p className="room-caption">当前账号 {view.username}。本地文件仍留在原位置。</p>
      {view.station && <StationSocialPanel station={view.station} openRoom={openRoom} />}
      <Button type="button" variant="outline" size="sm" disabled={busy}
        onClick={() => void restart("station_account_logout")}>退出账号并重启</Button>
    </div> : view ? <form className="transfer-form" onSubmit={login}>
      <label>账号站点<Input name="station" defaultValue={defaultStation} placeholder="自建站点 HTTPS 地址" disabled={busy} required /></label>
      <label>账号名<Input name="username" autoComplete="username" disabled={busy} maxLength={64} required /></label>
      <label>密码<Input name="password" type="password" autoComplete="current-password" disabled={busy} maxLength={256} required /></label>
      {view.can_associate && <label>本机工作区<select name="workspace" aria-label="本机工作区" defaultValue="separate" disabled={busy}>
        <option value="separate">使用此账号的独立工作区</option>
        <option value="associate">关联现有工作区</option>
      </select></label>}
      <p className="room-caption">使用在站点网页注册的账号。切换工作区会重启柠猫，原文件保留在原位置。</p>
      <Button type="submit" size="sm" disabled={busy}>登录并切换工作区</Button>
    </form> : error ? <Button type="button" variant="outline" size="sm" onClick={load}>重新检查</Button> : null}
  </details>;
}
