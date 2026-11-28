import { ArrowLeft, ChevronRight, FolderOpen, FolderUp, MessageCircle, Palette, UserRound, UsersRound } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import "./rooms.css";
import "./station.css";

const themeKey = "ningmao-web-theme";
const themes = { light: "浅白", dark: "深蓝", blue: "亮蓝" };
type Theme = keyof typeof themes;

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(themeKey);
    if (value === "light" || value === "dark" || value === "blue") return value;
  } catch { /* Browser storage can be disabled. */ }
  return "light";
}

export function StationHeader({ page, returnToRoom = "/rooms", account = "", accountHref = "/account" }: {
  page: "room" | "account" | "social";
  returnToRoom?: string;
  account?: string;
  accountHref?: string;
}) {
  const [theme, setTheme] = useState(savedTheme);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch { /* Keep the current page usable. */ }
  }, [theme]);

  return <header className="room-header station-header">
    <a className="station-brand" href="/rooms">
      <span className="station-brand-icon"><FolderUp size={19} aria-hidden /></span>
      <strong>柠猫文件工作站</strong>
    </a>
    <nav className="station-nav" aria-label="站点导航">
      {page === "account" && <a className="room-nav-link" href={returnToRoom}><ArrowLeft size={15} aria-hidden />返回互传区</a>}
      {page === "social" && <a className="room-nav-link" href="/rooms"><FolderUp size={15} aria-hidden />临时互传区</a>}
      {page === "room" && account && <a className="room-nav-link" href="/social"><UsersRound size={15} aria-hidden />好友与文件群</a>}
      {page !== "account" && <a className="room-nav-link station-account-link" href={accountHref}>
        <UserRound size={15} aria-hidden /><span>{account || "账号"}</span>
      </a>}
      <label className="station-theme">
        <Palette size={15} aria-hidden />
        <select aria-label="主题" value={theme} onChange={event => setTheme(event.target.value as Theme)}>
          {Object.entries(themes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </nav>
  </header>;
}

export type StationConversation = { code: string; name: string; direct: boolean };

export function StationConversationLink({ room, showKind = true }: { room: StationConversation; showKind?: boolean }) {
  const Icon = room.direct ? MessageCircle : FolderOpen;
  return <a className="station-conversation" href={`/rooms?code=${encodeURIComponent(room.code)}`}>
    <span className="station-conversation-icon"><Icon size={17} aria-hidden /></span>
    <span className="station-conversation-name">
      <strong>{room.name}</strong>
      {showKind && <small>{room.direct ? "私聊" : "固定文件群"}</small>}
    </span>
    <ChevronRight size={16} aria-hidden />
  </a>;
}
