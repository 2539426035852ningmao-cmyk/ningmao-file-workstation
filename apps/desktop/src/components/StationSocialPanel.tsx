import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { RoomAvatar } from "./RoomVisuals";

type Friend = { id: string; username: string; requester: string; accepted: number };
type Conversation = { code: string; name: string; direct: boolean };
type Social = { me: string; friends: Friend[]; rooms: Conversation[] };
type Message = { id: number; sender: string; username: string; body: string };
const send = <T,>(action: string, input?: object, room?: string) =>
  invoke<T>("station_social_request", { action, input, room });

export function StationSocialPanel({ station, openRoom }: { station: string; openRoom: (link: string) => Promise<void> }) {
  const [data, setData] = useState<Social>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  async function load() { setData(await send<Social>("")); }
  useEffect(() => { void load().catch(failure => setError(String(failure))); }, []);

  async function run(task: () => Promise<void>) {
    setError("");
    setBusy(true);
    try { await task(); }
    catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  const join = (code: string) => openRoom(new URL(`/rooms?code=${encodeURIComponent(code)}`, station).href);
  async function create(ids: string[], direct: boolean, name = "") {
    const { code } = await send<{ code: string }>("rooms", { members: ids, direct, name });
    await join(code);
    await load();
  }
  function requestFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const username = String(new FormData(form).get("username") ?? "");
    void run(async () => { await send("request", { username }); await load(); form.reset(); });
  }
  const friends = data?.friends.filter(friend => friend.accepted) ?? [];

  return <div className="transfer-form" role="group" aria-label="好友与文件群">
    <div className="room-desktop-heading"><h3>好友与文件群</h3>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void run(load)}>刷新列表</Button>
    </div>
    {error && <p role="alert">{error}</p>}
    {data && <>
      {data.rooms.length > 0 && <ul className="transfer-form">{data.rooms.map(room => <li key={room.code}>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => join(room.code))}>
          {room.name} <span className="room-caption">{room.direct ? "私聊" : "固定群"}</span>
        </Button>
      </li>)}</ul>}
      <form className="transfer-form" onSubmit={requestFriend}>
        <label>好友账号名<Input name="username" required maxLength={64} /></label>
        <Button type="submit" size="sm" variant="outline" disabled={busy}>发送好友申请</Button>
      </form>
      <ul className="transfer-form">{data.friends.map(friend => <li key={friend.id} className="room-person">
        <span className="room-identity"><RoomAvatar id={friend.id} /> {friend.username}</span>
        {friend.accepted ? <Button type="button" size="sm" disabled={busy}
          onClick={() => void run(() => create([friend.id], true))}>打开私聊</Button>
          : friend.requester !== data.me ? <Button type="button" size="sm" disabled={busy} onClick={() => void run(async () => {
            await send("accept", { id: friend.id }); await load();
          })}>同意申请</Button> : <span className="room-caption">等待确认</span>}
      </li>)}</ul>
      {friends.length > 0 && <Button type="button" size="sm" variant="outline" aria-expanded={group}
        onClick={() => setGroup(!group)}>创建固定文件群</Button>}
      {group && <form className="transfer-form" onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name") ?? "");
        void run(() => create(members, false, name));
      }}>
        <label>群名称<Input name="name" maxLength={60} required /></label>
        <fieldset className="connection-fields"><legend>邀请好友（最多 4 人）</legend>
          {friends.map(friend => <label key={friend.id} className="transfer-room-approval">
            <input type="checkbox" checked={members.includes(friend.id)}
              disabled={busy || (!members.includes(friend.id) && members.length >= 4)}
              onChange={event => setMembers(ids => event.target.checked ? [...ids, friend.id] : ids.filter(id => id !== friend.id))} />
            {friend.username}
          </label>)}
        </fieldset>
        <Button type="submit" size="sm" disabled={busy || !members.length}>建群</Button>
      </form>}
    </>}
  </div>;
}

export function StationChat({ code }: { code: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let pending = false;
    const poll = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const result = await send<{ messages: Message[] }>("messages", undefined, code);
        if (active) setMessages(result.messages);
      } catch (failure) {
        if (active) setError(String(failure));
      } finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(poll, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [code]);
  return <div className="room-desktop-card transfer-form">
    <h3>文字消息</h3>
    {error && <p role="alert">{error}</p>}
    <ul className="room-file-list" aria-label="近期消息">{messages.map(item => <li key={item.id}>
      <div className="room-file-name"><strong className="room-identity"><RoomAvatar id={item.sender} /> {item.username}</strong><span className="room-chat-body">{item.body}</span></div>
    </li>)}</ul>
    <form className="transfer-form" onSubmit={event => {
      event.preventDefault();
      if (!message.trim() || busy) return;
      setBusy(true); setError("");
      void send<{ messages: Message[] }>("messages", { room: code, text: message })
        .then(result => { setMessages(result.messages); setMessage(""); })
        .catch(failure => setError(String(failure))).finally(() => setBusy(false));
    }}>
      <label>消息<Input value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <Button type="submit" size="sm" disabled={busy || !message.trim()}>发送消息</Button>
    </form>
  </div>;
}
