import { DurableObject } from "cloudflare:workers";
import {DeviceRegistry} from "./device-registry";
export {DeviceRegistry} from "./device-registry";
import { verifyAccessJWT } from "../src/access";
import { DEVICE_ID_RE, MAX_SIGNAL_BYTES, isClientSignal } from "../src/signaling";

interface Env {
  ROOMS: DurableObjectNamespace<DeviceRoom>;
  REGISTRY: DurableObjectNamespace<DeviceRegistry>;
  ASSETS: Fetcher;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
}
type Attachment = { id: string; name: string; count: number; since: number; kind?: "browser" | "desktop"; expires_at?: number };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
async function identify(request: Request, env: Env) {
  return verifyAccessJWT(
    request.headers.get("Cf-Access-Jwt-Assertion"),
    env.CF_ACCESS_TEAM_DOMAIN,
    env.CF_ACCESS_AUD
  );
}

async function registry(env:Env,path:string,body:Record<string,unknown>):Promise<Response>{
  const stub=env.REGISTRY.get(env.REGISTRY.idFromName("ningmao-w1-v1"));
  return stub.fetch(new Request("https://registry.internal"+path,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  }));
}
async function readJson(request:Request):Promise<Record<string,unknown>|null>{
  if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return null;
  const raw=await request.text();
  if(raw.length>2048)return null;
  try{
    const parsed:unknown=JSON.parse(raw);
    return parsed!==null && typeof parsed==="object" && !Array.isArray(parsed)?parsed as Record<string,unknown>:null;
  }catch{return null;}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Only these two narrowly scoped routes may be exempted from Cloudflare Access
    // by the domain owner. They never accept a browser cookie as a Windows credential.
    if (url.pathname === "/device-link/claim" && request.method === "POST") {
      const body=await readJson(request);
      if(!body)return json({error:"invalid_json"},400);
      return registry(env,"/claim",{code:body.code,device:body.device});
    }
    if (url.pathname === "/device-link/connect" && request.method === "GET") {
      if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return json({error:"websocket_required"},426);
      const auth=request.headers.get("Authorization")||"";
      const id=url.searchParams.get("device")||"";
      if(!auth.startsWith("Bearer ")||!DEVICE_ID_RE.test(id))return json({error:"unauthorized"},401);
      const verified=await registry(env,"/verify",{token:auth.slice(7),id});
      if(!verified.ok)return json({error:"unauthorized"},401);
      const device=await verified.json() as {sub:string;id:string;name:string;expires_at:number};
      const room=env.ROOMS.get(env.ROOMS.idFromName(device.sub));
      return room.fetch(new Request("https://room.internal/connect",{
        headers:{"Upgrade":"websocket","x-device":device.id,"x-name":device.name,
          "x-kind":"desktop","x-expires":String(device.expires_at)}
      }));
    }
    if (!url.pathname.startsWith("/api/")) {
      if(url.pathname.startsWith("/device-link/"))return json({error:"not_found"},404);
      return env.ASSETS.fetch(request);
    }
    const user = await identify(request, env);
    if (!user) return json({ error: "unauthorized", message: "未通过 Cloudflare Access 身份验证或尚未配置服务" }, 401);
    if (url.pathname === "/api/me" && request.method === "GET") {
      return json({ email: user.email, id: user.sub });
    }
    if(url.pathname === "/api/device-invites" && request.method === "POST") {
      if(!await readJson(request))return json({error:"invalid_json"},400);
      return registry(env,"/issue",{sub:user.sub});
    }
    if(url.pathname === "/api/devices" && request.method === "GET") {
      return registry(env,"/list",{sub:user.sub});
    }
    if(url.pathname === "/api/devices/revoke" && request.method === "POST") {
      const body=await readJson(request);
      if(!body||typeof body.id!=="string"||!DEVICE_ID_RE.test(body.id))return json({error:"invalid_device"},400);
      const revoked=await registry(env,"/revoke",{sub:user.sub,id:body.id});
      const status=await revoked.json() as {removed?:boolean};
      if(status.removed) {
        const room=env.ROOMS.get(env.ROOMS.idFromName(user.sub));
        await room.fetch(new Request("https://room.internal/revoke",{
          method:"POST",headers:{"x-device":body.id}
        }));
      }
      return json({removed:Boolean(status.removed)});
    }
    if (url.pathname === "/api/capabilities" && request.method === "GET") {
      return json({ protocol_version: 1, browser_webrtc: true, desktop_native_bridge: false, cloud_storage: false, max_file_bytes: 64 * 1024 * 1024 });
    }
    if (url.pathname === "/api/connect" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
      const id = url.searchParams.get("device") || "";
      const name = (url.searchParams.get("name") || "").trim();
      if (!DEVICE_ID_RE.test(id) || name.length < 1 || name.length > 40) return json({ error: "invalid_device" }, 400);
      const room = env.ROOMS.get(env.ROOMS.idFromName(user.sub));
      const internal = new Request("https://room.internal/connect", {
        headers: { "Upgrade": "websocket", "x-device": id, "x-name": name }
      });
      return room.fetch(internal);
    }
    return json({ error: "not_found" }, 404);
  }
} satisfies ExportedHandler<Env>;

export class DeviceRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const path=new URL(request.url).pathname;
    if(path==="/revoke" && request.method==="POST") {
      const id=request.headers.get("x-device")||"";
      if(!DEVICE_ID_RE.test(id))return json({error:"invalid_device"},400);
      for(const ws of this.ctx.getWebSockets()){
        const attached=ws.deserializeAttachment() as Attachment|null;
        if(attached?.id===id && attached.kind==="desktop")ws.close(4003,"Device revoked");
      }
      this.broadcastPresence();
      return json({revoked:true});
    }
    if (path !== "/connect" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Not found", { status: 404 });
    const id = request.headers.get("x-device") || "";
    const name = request.headers.get("x-name") || "";
    if (!DEVICE_ID_RE.test(id) || !name || name.length > 40) return new Response("Invalid device", { status: 400 });
    const kind=request.headers.get("x-kind")==="desktop"?"desktop":"browser";
    const expires_at=kind==="desktop"?Number(request.headers.get("x-expires")):undefined;
    if(kind==="desktop"&&(!Number.isSafeInteger(expires_at)||!expires_at||expires_at<=Date.now()))
      return json({error:"expired_device"},401);
    const connections = this.ctx.getWebSockets();
    // A single account has a deliberately small online-session budget.
    if (connections.length >= 8 && !connections.some(peer => (peer.deserializeAttachment() as Attachment | null)?.id === id)) {
      return json({ error: "device_limit", message: "单账号最多同时连接 8 个浏览器" }, 429);
    }
    for (const peer of connections) {
      const data = peer.deserializeAttachment() as Attachment | null;
      if (data?.id === id) peer.close(4001, "Device replaced by newer connection");
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name, count: 0, since: Date.now(),kind,expires_at } satisfies Attachment);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }
  private peers() {
    const now=Date.now();
    return this.ctx.getWebSockets().filter(ws => {
      if(ws.readyState!==1)return false;
      const item=ws.deserializeAttachment() as Attachment|null;
      if(item?.kind==="desktop" && (item.expires_at??0)<=now) {
        ws.close(4003,"Device grant expired");
        return false;
      }
      return true;
    });
  }
  private broadcastPresence() {
    const list = this.peers().map(ws => ws.deserializeAttachment() as Attachment | null)
      .filter((v): v is Attachment => Boolean(v))
      .map(({ id, name }) => ({ id, name }));
    for (const ws of this.peers()) ws.send(JSON.stringify({ type: "presence", devices: list }));
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > MAX_SIGNAL_BYTES) { ws.close(1009, "Message too large"); return; }
    const identity = ws.deserializeAttachment() as Attachment | null;
    if (!identity) { ws.close(1008, "No identity"); return; }
    const now = Date.now();
    if(identity.kind==="desktop" && (identity.expires_at??0)<=now) {
      ws.close(4003,"Device grant expired");this.broadcastPresence();return;
    }
    if (now - identity.since > 10_000) { identity.since = now; identity.count = 0; }
    identity.count++;
    ws.serializeAttachment(identity);
    if (identity.count > 100) { ws.close(1008, "Rate limit"); return; }
    let msg: unknown;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!isClientSignal(msg)) return;
    if (msg.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
    if (msg.to === identity.id) return;
    const recipient = this.peers().find(peer => (peer.deserializeAttachment() as Attachment | null)?.id === msg.to);
    if (!recipient) {
      ws.send(JSON.stringify({ type: "unavailable", to: msg.to, id: msg.payload.id }));
      return;
    }
    recipient.send(JSON.stringify({ type: msg.type, from: identity.id, payload: msg.payload }));
  }
  async webSocketClose() { this.broadcastPresence(); }
  async webSocketError() { this.broadcastPresence(); }
}
