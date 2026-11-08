import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { DEVICE_ID_RE, MAX_SIGNAL_BYTES, isClientSignal } from "../src/signaling";

interface Env {
  ROOMS: DurableObjectNamespace<DeviceRoom>;
  ASSETS: Fetcher;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
}
type Identity = { sub: string; email: string };
type Attachment = { id: string; name: string; count: number; since: number };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
const cache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function identify(request: Request, env: Env): Promise<Identity | null> {
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!domain || !domain.endsWith(".cloudflareaccess.com") || domain.startsWith("CONFIGURE_") ||
      !aud || aud === "CONFIGURE_ACCESS_AUD") return null;
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return null;
  try {
    let jwks = cache.get(domain);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`));
      cache.set(domain, jwks);
    }
    const { payload } = await jwtVerify(jwt, jwks, {
      issuer: `https://${domain}`, audience: aud, algorithms: ["RS256"]
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : "已验证用户" };
  } catch {
    return null;
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const user = await identify(request, env);
    if (!user) return json({ error: "unauthorized", message: "未通过 Cloudflare Access 身份验证或尚未配置服务" }, 401);
    if (url.pathname === "/api/me" && request.method === "GET") {
      return json({ email: user.email, id: user.sub });
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
    if (new URL(request.url).pathname !== "/connect" ||
        request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Not found", { status: 404 });
    const id = request.headers.get("x-device") || "";
    const name = request.headers.get("x-name") || "";
    if (!DEVICE_ID_RE.test(id) || !name || name.length > 40) return new Response("Invalid device", { status: 400 });
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
    server.serializeAttachment({ id, name, count: 0, since: Date.now() } satisfies Attachment);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }
  private peers() {
    return this.ctx.getWebSockets().filter(ws => ws.readyState === 1);
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
      ws.send(JSON.stringify({ type: "unavailable", to: msg.to }));
      return;
    }
    recipient.send(JSON.stringify({ type: msg.type, from: identity.id, payload: msg.payload }));
  }
  async webSocketClose() { this.broadcastPresence(); }
  async webSocketError() { this.broadcastPresence(); }
}
