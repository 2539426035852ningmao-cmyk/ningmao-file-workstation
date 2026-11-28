import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, FolderOpen, MessageCircle, Plus, Send, UserPlus, UsersRound } from "lucide-react";
import { RoomAvatar } from "./RoomVisuals";
import { StationConversationLink, StationHeader, type StationConversation } from "./StationChrome";
import { defaultAnimalAvatar } from "./animal-avatars.mjs";
import "./rooms.css";

type Friend = { id: string; username: string; requester: string; accepted: number; avatar?: string | null };
type Social = { me: string; friends: Friend[]; rooms: StationConversation[] };
type Message = { id: number; sender: string; username: string; body: string; sent: number; avatar?: string | null };

class SocialRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function socialRequest<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/social" + path, {
    method: data ? "POST" : "GET",
    ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
    signal,
  });
  const body = response.headers.get("Content-Type")?.startsWith("application/json") ? await response.json() : undefined;
  if (!response.ok || body === undefined) {
    throw new SocialRequestError(response.status, typeof body === "string" ? body : "暂时无法读取站点，请重试。");
  }
  return body;
}

export function StationSocial() {
  const [social, setSocial] = useState<Social>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState<{ signIn: boolean; message: string }>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  async function refresh() { setSocial(await socialRequest<Social>("")); }
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    const poll = async () => {
      if (!document.hidden) {
        try {
          const value = await socialRequest<Social>("", undefined, controller.signal);
          if (controller.signal.aborted) return;
          setSocial(value);
          setLoadError(undefined);
        } catch (failure) {
          if (controller.signal.aborted) return;
          const signIn = failure instanceof SocialRequestError && failure.status === 401;
          if (signIn) setSocial(undefined);
          setLoadError({ signIn, message: failure instanceof TypeError ? "暂时无法连接站点。" : (failure as Error).message });
          if (signIn) return;
        }
      }
      timer = window.setTimeout(poll, 4000);
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [loadAttempt]);
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
  const pending = social?.friends.filter(friend => !friend.accepted) ?? [];

  return <main className="room-page station-page">
    <StationHeader page="social" />
    <div className="station-heading"><h1>好友与文件群</h1></div>
    {error && <p className="room-feedback" role="alert">{error}</p>}
    {notice && <p className="room-feedback" role="status">{notice}</p>}
    {social && loadError && <p className="room-feedback" role="alert">{loadError.message}</p>}
    {!social ? <section className="room-card station-social-state">
      <span className="station-page-icon"><UsersRound size={24} aria-hidden /></span>
      <p className="room-note" role={loadError ? "alert" : "status"}>
        {loadError?.signIn ? "登录站点账号后，即可加好友、私聊和使用固定文件群。" : loadError?.message ?? "正在加载好友与文件群…"}
      </p>
      {loadError?.signIn ? <a className="station-action room-nav-link" href="/account">打开账号<ArrowRight size={16} aria-hidden /></a>
        : loadError && <button type="button" onClick={() => { setLoadError(undefined); setLoadAttempt(attempt => attempt + 1); }}>重新加载</button>}
    </section> : <div className="station-layout station-social-layout">
      <section className="room-card station-conversations" aria-labelledby="station-conversations-title">
        <div className="station-section-head">
          <h2 className="station-title" id="station-conversations-title"><FolderOpen size={18} aria-hidden />会话</h2>
          {friends.length > 0 && <button className="station-inline" type="button" disabled={busy} aria-expanded={creating}
            onClick={() => setCreating(value => !value)}><Plus size={16} aria-hidden />创建固定文件群</button>}
        </div>
        {creating && <form className="station-group-form station-form" onSubmit={event => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get("name") ?? "");
          void run(() => openConversation(chosen, false, name));
        }}>
          <label>群名称<input name="name" required maxLength={60} disabled={busy} /></label>
          <fieldset className="station-invite-friends"><legend>邀请好友（最多 4 人）</legend>
            {friends.map(friend => <label key={friend.id} className="room-choice station-friend-chip">
              <input type="checkbox" checked={chosen.includes(friend.id)} disabled={busy || (!chosen.includes(friend.id) && chosen.length >= 4)}
                onChange={event => setChosen(ids => event.target.checked ? [...ids, friend.id] : ids.filter(id => id !== friend.id))} />
              <RoomAvatar avatar={friend.avatar ?? defaultAnimalAvatar(friend.id)} /><span>{friend.username}</span>
            </label>)}
          </fieldset>
          <button type="submit" className="room-primary station-inline" disabled={busy || !chosen.length}>建群<ArrowRight size={16} aria-hidden /></button>
        </form>}
        {social.rooms.length === 0 ? <p className="station-empty"><MessageCircle size={22} aria-hidden />打开好友私聊，或创建一个固定文件群。</p>
          : <ul className="station-conversation-list">{social.rooms.map(room => <li key={room.code}><StationConversationLink room={room} /></li>)}</ul>}
      </section>
      <section className="room-card station-contacts" aria-labelledby="station-contacts-title">
        <h2 className="station-title" id="station-contacts-title"><UsersRound size={18} aria-hidden />好友</h2>
        <form className="station-form" onSubmit={sendRequest}>
          <label>好友账号名<input name="username" placeholder="输入对方的完整账号名" autoCapitalize="none" spellCheck={false} required maxLength={64} disabled={busy} /></label>
          <button className="station-inline" type="submit" disabled={busy}><UserPlus size={16} aria-hidden />发送好友申请</button>
        </form>
        {social.friends.length === 0 && <p className="station-empty"><UserPlus size={20} aria-hidden />添加好友后，就可以直接发文件。</p>}
        {pending.length > 0 && <section className="station-contact-group" aria-label="好友申请">
          <h3>好友申请</h3>
          <ul className="station-contact-list">{pending.map(friend => <li key={friend.id}>
            <span className="room-identity"><RoomAvatar id={friend.id} /><strong>{friend.username}</strong></span>
            <div className="room-row">
              {friend.requester !== social.me ? <button type="button" disabled={busy} onClick={() => void run(async () => {
                await socialRequest("/accept", { id: friend.id }); await refresh();
              })}>同意好友申请</button> : <small>等待对方确认</small>}
              <button className="station-quiet" type="button" disabled={busy}
                onClick={() => void run(async () => { await socialRequest("/remove", { id: friend.id }); await refresh(); })}>
                {friend.requester === social.me ? "取消申请" : "拒绝"}
              </button>
            </div>
          </li>)}</ul>
        </section>}
        {friends.length > 0 && <ul className="station-contact-list">{friends.map(friend => <li key={friend.id}>
          <span className="room-identity"><RoomAvatar avatar={friend.avatar ?? defaultAnimalAvatar(friend.id)} /><strong>{friend.username}</strong></span>
          <div className="room-row">
            <button type="button" disabled={busy} onClick={() => void run(() => openConversation([friend.id], true))}>打开私聊</button>
            <button className="station-quiet" type="button" disabled={busy} onClick={() => {
              if (!window.confirm(`移除好友「${friend.username}」？`)) return;
              void run(async () => { await socialRequest("/remove", { id: friend.id }); await refresh(); });
            }}>移除好友</button>
          </div>
        </li>)}</ul>}
      </section>
    </div>}
  </main>;
}

const messageTime = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function RoomChat({ code, accountId }: { code: string; accountId?: string }) {
  const [messages, setMessages] = useState<Message[]>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [loadProblem, setLoadProblem] = useState("");
  const transcript = useRef<HTMLUListElement>(null);
  const followLatest = useRef(true);
  const latest = messages?.at(-1)?.id;
  const path = `/messages?room=${encodeURIComponent(code)}`;
  useLayoutEffect(() => {
    const list = transcript.current;
    if (list && followLatest.current) list.scrollTop = list.scrollHeight;
  }, [latest]);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      if (document.hidden) return;
      try {
        const reply = await socialRequest<{ messages: Message[] }>(path, undefined, controller.signal);
        if (!controller.signal.aborted) {
          setMessages(reply.messages);
          setLoadProblem("");
        }
      } catch (failure) {
        if (!controller.signal.aborted) setLoadProblem(failure instanceof TypeError ? "暂时无法加载消息。" : (failure as Error).message);
      }
    };
    void update();
    const timer = window.setInterval(update, 2400);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [path]);
  return <section className="room-card station-chat" aria-labelledby="station-chat-title">
    <h2 className="station-title" id="station-chat-title"><MessageCircle size={18} aria-hidden />文字消息</h2>
    {!loadProblem && !messages?.length && <p className="room-note">{messages ? "还没有消息。" : "正在加载消息…"}</p>}
    <ul className="station-chat-list" aria-label="近期消息" ref={transcript} tabIndex={messages?.length ? 0 : undefined}
      onScroll={({ currentTarget: list }) => {
        followLatest.current = list.scrollHeight - list.clientHeight - list.scrollTop < 32;
      }}>
      {messages?.map(message => <li key={message.id} data-own={accountId === message.sender}>
        <div className="station-chat-meta"><RoomAvatar avatar={message.avatar ?? defaultAnimalAvatar(message.sender)} room={code} /><strong>{message.username}</strong>
          <time dateTime={new Date(message.sent).toISOString()}>{messageTime.format(message.sent)}</time>
        </div>
        <div className="station-chat-bubble">{message.body}</div>
      </li>)}
    </ul>
    {(problem || loadProblem) && <p className="room-feedback" role="alert">{problem || loadProblem}</p>}
    <form className="station-chat-form station-form" onSubmit={event => {
      event.preventDefault();
      if (busy || !text.trim()) return;
      setProblem("");
      setBusy(true);
      void socialRequest<{ messages: Message[] }>("/messages", { room: code, text }).then(reply => {
        followLatest.current = true;
        setMessages(reply.messages);
        setLoadProblem("");
        setText("");
      }).catch(failure => setProblem(failure.message)).finally(() => setBusy(false));
    }}>
      <label>消息<textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <button type="submit" className="station-inline" disabled={busy || !text.trim()}><Send size={16} aria-hidden />发送消息</button>
    </form>
  </section>;
}
