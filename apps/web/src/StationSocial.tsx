import { useEffect, useState, type FormEvent } from "react";
import { UsersRound } from "lucide-react";
import { RoomAvatar } from "./RoomVisuals";
import "./rooms.css";

type Friend = { id: string; username: string; requester: string; accepted: number };
type Conversation = { code: string; name: string; direct: boolean };
type Social = { me: string; friends: Friend[]; rooms: Conversation[] };
type Message = { id: number; sender: string; username: string; body: string; sent: number };

export async function socialRequest<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/social" + path, {
    method: data ? "POST" : "GET",
    ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body === "string" ? body : "操作未完成，请重试。");
  return body;
}

export function StationSocial() {
  const [social, setSocial] = useState<Social>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function refresh() { setSocial(await socialRequest<Social>("")); }
  useEffect(() => {
    document.documentElement.dataset.theme ??= "light";
    let active = true;
    const poll = () => {
      if (document.hidden) return;
      void socialRequest<Social>("").then(value => {
        if (active) setSocial(value);
      }).catch(failure => { if (active) setError(failure.message); });
    };
    poll();
    const timer = window.setInterval(poll, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "操作未完成，请重试。"); }
    finally { setBusy(false); }
  }
  async function openConversation(members: string[], direct: boolean, name = "") {
    const reply = await socialRequest<{ code: string }>("/rooms", { members, direct, name });
    location.assign(`/rooms?code=${reply.code}`);
  }
  function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const username = String(new FormData(form).get("username") ?? "");
    void run(async () => {
      await socialRequest("/request", { username });
      await refresh();
      setNotice("好友申请已提交。");
      form.reset();
    });
  }
  const friends = social?.friends.filter(friend => friend.accepted) ?? [];

  return <main className="room-page">
    <header className="room-header">
      <strong><UsersRound size={20} aria-hidden /> 柠猫文件工作站</strong>
      <nav className="room-row" aria-label="站点导航"><a className="room-nav-link" href="/rooms">临时互传区</a><a className="room-nav-link" href="/account">账号</a></nav>
    </header>
    <h1>好友与文件群</h1>
    {error && <p className="room-feedback" role="alert">{error}</p>}
    {notice && <p className="room-feedback" role="status">{notice}</p>}
    {!social ? <a className="room-nav-link" href="/account">打开账号</a> : <>
      <section className="room-card">
        <h2>会话</h2>
        {social.rooms.length === 0 && <p className="room-note">打开好友私聊，或创建一个固定文件群。</p>}
        <ul className="room-social-list">{social.rooms.map(room => <li key={room.code}>
          <a className="room-nav-link" href={`/rooms?code=${room.code}`}>{room.name} <small>{room.direct ? "私聊" : "固定群"}</small></a>
        </li>)}</ul>
        {friends.length > 0 && <button type="button" aria-expanded={creating} onClick={() => setCreating(!creating)}>创建固定文件群</button>}
        {creating && <form onSubmit={event => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get("name") ?? "");
          void run(() => openConversation(chosen, false, name));
        }}>
          <label>群名称<input name="name" required maxLength={60} /></label>
          <fieldset><legend>邀请好友（最多 4 人）</legend>
            {friends.map(friend => <label key={friend.id} className="room-choice">
              <input type="checkbox" checked={chosen.includes(friend.id)} disabled={busy || (!chosen.includes(friend.id) && chosen.length >= 4)}
                onChange={event => setChosen(ids => event.target.checked ? [...ids, friend.id] : ids.filter(id => id !== friend.id))} />
              {friend.username}
            </label>)}
          </fieldset>
          <button type="submit" className="room-primary" disabled={busy || !chosen.length}>建群</button>
        </form>}
      </section>
      <section className="room-card">
        <h2>好友</h2>
        <form onSubmit={sendRequest}>
          <label>好友账号名<input name="username" required maxLength={64} /></label>
          <button type="submit" disabled={busy}>发送好友申请</button>
        </form>
        <ul className="room-social-list">{social.friends.map(friend => <li key={friend.id}>
          <span className="room-identity"><RoomAvatar id={friend.id} /> {friend.username}</span>
          <div className="room-row">
            {friend.accepted ? <button type="button" disabled={busy} onClick={() => void run(() => openConversation([friend.id], true))}>打开私聊</button>
              : friend.requester !== social.me ? <button type="button" disabled={busy} onClick={() => void run(async () => {
                await socialRequest("/accept", { id: friend.id }); await refresh();
              })}>同意好友申请</button> : <small>等待对方确认</small>}
            <button type="button" disabled={busy} onClick={() => {
              if (friend.accepted && !window.confirm(`移除好友「${friend.username}」？`)) return;
              void run(async () => { await socialRequest("/remove", { id: friend.id }); await refresh(); });
            }}>{friend.accepted ? "移除好友" : friend.requester === social.me ? "取消申请" : "拒绝"}</button>
          </div>
        </li>)}</ul>
      </section>
    </>}
  </main>;
}

export function RoomChat({ code }: { code: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const path = `/messages?room=${encodeURIComponent(code)}`;
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      if (document.hidden) return;
      try {
        const reply = await socialRequest<{ messages: Message[] }>(path, undefined, controller.signal);
        if (!controller.signal.aborted) setMessages(reply.messages);
      } catch (failure) {
        if (!controller.signal.aborted) setProblem(failure instanceof Error ? failure.message : "暂时无法加载消息。");
      }
    };
    void update();
    const timer = window.setInterval(update, 2400);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [path]);
  return <section className="room-card">
    <h2>文字消息</h2>
    {!messages.length && <p className="room-note">还没有消息。</p>}
    <ul className="room-social-list room-messages" aria-label="近期消息">
      {messages.map(message => <li key={message.id}>
        <strong className="room-identity"><RoomAvatar id={message.sender} /> {message.username}</strong>
        <span>{message.body}</span>
      </li>)}
    </ul>
    {problem && <p role="alert">{problem}</p>}
    <form onSubmit={event => {
      event.preventDefault();
      if (busy || !text.trim()) return;
      setProblem("");
      setBusy(true);
      void socialRequest<{ messages: Message[] }>("/messages", { room: code, text }).then(reply => {
        setMessages(reply.messages);
        setText("");
      }).catch(failure => setProblem(failure.message)).finally(() => setBusy(false));
    }}>
      <label>消息<textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <button type="submit" disabled={busy || !text.trim()}>发送消息</button>
    </form>
  </section>;
}
