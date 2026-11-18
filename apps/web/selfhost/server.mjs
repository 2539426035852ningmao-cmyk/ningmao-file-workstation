import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MAX_BROWSER_TRANSFER_BYTES, safeFileName } from "../src/file-preparation.mjs";

const DAY = 86_400_000;
const STORAGE_LIMIT = 512 * 1024 * 1024;
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const token = (size = 24) => randomBytes(size).toString("hex");
const sha = value => createHash("sha256").update(value).digest("hex");
const types = { js: "text/javascript", css: "text/css", svg: "image/svg+xml", png: "image/png" };

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireValue(value, status, message) {
  if (!value) throw new RequestError(status, message);
  return value;
}

async function readBody(request, limit) {
  requireValue(Number(request.headers["content-length"] ?? 0) <= limit, 413, "文件或请求太大。");
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    requireValue(size <= limit, 413, "文件或请求太大。");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function readJson(request) {
  requireValue(request.headers["content-type"] === "application/json", 415, "请求格式无效。");
  try {
    const data = JSON.parse(await readBody(request, 4096));
    requireValue(data && typeof data === "object", 400, "请求内容无效。");
    return data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new RequestError(400, "请求内容无效。");
    throw error;
  }
}

function validName(value) {
  return requireValue(
    typeof value === "string" && value.trim() && value.length <= 100 && !/[\u0000-\u001f\u007f]/u.test(value) && value.trim(),
    400, "请输入 1 到 100 个字符的名称。",
  );
}

export function createRoomServer(directory, tls) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(directory, "rooms.sqlite"));
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY, created INTEGER NOT NULL, approval INTEGER NOT NULL, recovery TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      room TEXT REFERENCES rooms ON DELETE CASCADE, session TEXT NOT NULL,
      id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL,
      PRIMARY KEY(room, session)
    );
    CREATE TABLE IF NOT EXISTS files (
      room TEXT REFERENCES rooms ON DELETE CASCADE, id TEXT PRIMARY KEY, sender TEXT NOT NULL,
      name TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL, expires INTEGER NOT NULL, retain_until INTEGER NOT NULL,
      data BLOB NOT NULL
    );
  `);
  const members = db.prepare("SELECT id, name, role, status FROM members WHERE room = ? AND session = ?");
  const addMember = db.prepare("INSERT INTO members VALUES (?, ?, ?, ?, ?, ?)");
  const purgeFiles = db.prepare("DELETE FROM files WHERE expires <= ?");
  const purgeRooms = db.prepare("DELETE FROM rooms WHERE created < ? AND NOT EXISTS (SELECT 1 FROM files WHERE files.room = rooms.code)");
  function purge() {
    purgeFiles.run(Date.now());
    purgeRooms.run(Date.now() - 7 * DAY);
  }
  purge();
  let uploads = 0;

  const handle = async (request, response) => {
    const json = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(value));
    };
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const url = new URL(request.url, "http://localhost");
      const { pathname } = url;
      if (!pathname.startsWith("/api/")) {
        requireValue(request.method === "GET", 405, "操作不可用。");
        if (pathname === "/") {
          response.writeHead(302, { Location: "/rooms" + url.search });
          return response.end();
        }
        const asset = /^\/assets\/([\w.-]+)\.(js|css|svg|png)$/.exec(pathname);
        requireValue(pathname === "/rooms" || asset, 404, "页面不存在。");
        const content = asset ? readFileSync(resolve(dist, "assets", asset[1] + "." + asset[2]))
          : readFileSync(resolve(dist, "index.html"));
        response.writeHead(200, { "Content-Type": asset ? types[asset[2]] : "text/html; charset=utf-8" });
        return response.end(content);
      }
      const post = request.method === "POST";
      if (post) {
        const origin = request.headers.origin;
        requireValue(request.headers["sec-fetch-site"] !== "cross-site" &&
          (!origin || origin === (tls ? "https://" : "http://") + request.headers.host),
          403, "请从互传站点发起操作。");
      }
      const cookie = /(?:^|;\s*)ningmao_room=([a-f0-9]{48})(?:;|$)/.exec(request.headers.cookie ?? "")?.[1];
      const session = sha(cookie ?? "");
      function identify() {
        if (cookie) return session;
        const secret = token();
        response.setHeader("Set-Cookie", `ningmao_room=${secret}; Path=/api/rooms; HttpOnly; SameSite=Strict; Max-Age=604800${tls ? "; Secure" : ""}`);
        return sha(secret);
      }
      if (post && pathname === "/api/rooms") {
        const input = await readJson(request);
        const name = validName(input.name);
        purge();
        requireValue(db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count < 128, 409, "站点的互传区已满。");
        const code = token(16);
        const recovery = token();
        db.prepare("INSERT INTO rooms VALUES (?, ?, ?, ?)").run(code, Date.now(), Number(input.approval === true), sha(recovery));
        addMember.run(code, identify(), token(12), name, "owner", "active");
        return json(201, { code, recovery });
      }

      const match = /^\/api\/rooms\/([a-f0-9]{32})(?:\/(join|recover|decide|promote|files|revoke|extend)(?:\/([a-f0-9]{32}))?)?$/.exec(pathname);
      requireValue(match, 404, "页面不存在。");
      const [, code, action, fileId] = match;
      const room = requireValue(db.prepare("SELECT * FROM rooms WHERE code = ?").get(code), 404, "找不到这个互传区。");
      let member = members.get(code, session);

      if (post && action === "join" && !fileId) {
        const input = await readJson(request);
        if (!member) {
          requireValue(Date.now() < room.created + DAY, 410, "邀请码已过期。");
          requireValue(db.prepare("SELECT COUNT(*) AS count FROM members WHERE room = ?").get(code).count < 64, 409, "互传区人数已满。");
          const joiningSession = identify();
          addMember.run(code, joiningSession, token(12), validName(input.name), "member", room.approval ? "pending" : "active");
          member = members.get(code, joiningSession);
        }
        return json(200, { member });
      }
      if (post && action === "recover" && !fileId) {
        const input = await readJson(request);
        requireValue(typeof input.recovery === "string" && sha(input.recovery) === room.recovery, 403, "管理恢复码无效。");
        const previous = db.prepare("SELECT id, name FROM members WHERE room = ? AND role = 'owner'").get(code);
        db.exec("BEGIN");
        try {
          db.prepare("DELETE FROM members WHERE room = ? AND (session = ? OR role = 'owner')").run(code, session);
          addMember.run(code, identify(), previous.id, previous.name, "owner", "active");
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return json(200, { code });
      }
      if (!action && request.method === "GET" && member?.status !== "active") {
        return json(403, { status: member?.status, message: "请先加入互传区。" });
      }
      requireValue(member?.status === "active", 403, "请先加入互传区。");
      const manager = member.role === "owner" || member.role === "admin";
      if (!action && request.method === "GET") {
        return json(200, {
          code, member, inviteExpires: room.created + DAY,
          members: db.prepare(`SELECT id, name, role, status FROM members
            WHERE room = ? AND (status = 'active' OR ? AND status = 'pending') ORDER BY rowid`).all(code, Number(manager)),
          files: db.prepare(`SELECT id, sender, name, size, digest, expires, retain_until FROM files
            WHERE room = ? AND expires > ? ORDER BY rowid DESC`).all(code, Date.now()),
        });
      }
      if (post && action === "decide" && !fileId) {
        requireValue(manager, 403, "只有群主或管理员可以批准加入。");
        const input = await readJson(request);
        requireValue(typeof input.id === "string" && typeof input.accept === "boolean", 400, "请求内容无效。");
        db.prepare("UPDATE members SET status = ? WHERE room = ? AND id = ? AND status = 'pending'").run(input.accept ? "active" : "denied", code, input.id);
        return json(200, {});
      }
      if (post && action === "promote" && !fileId) {
        requireValue(member.role === "owner", 403, "只有群主可以调整管理员。");
        const input = await readJson(request);
        requireValue(typeof input.id === "string" && typeof input.enabled === "boolean", 400, "请求内容无效。");
        const count = db.prepare("SELECT COUNT(*) AS count FROM members WHERE room = ? AND role = 'admin'").get(code).count;
        requireValue(!input.enabled || count < 3, 409, "最多可以指定三名管理员。");
        db.prepare("UPDATE members SET role = ? WHERE room = ? AND id = ? AND role <> 'owner' AND status = 'active'").run(input.enabled ? "admin" : "member", code, input.id);
        return json(200, {});
      }
      if (post && action === "files" && !fileId) {
        let name;
        try { name = validName(decodeURIComponent(request.headers["x-file-name"] ?? "")); }
        catch (error) { if (error instanceof URIError) throw new RequestError(400, "文件名无效。"); throw error; }
        requireValue(safeFileName(name), 400, "文件名无效，请先修改文件名。");
        const digest = request.headers["x-sha256"];
        requireValue(typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest), 400, "缺少文件校验值。");
        requireValue(uploads < 2, 429, "当前上传较多，请稍后重试。");
        uploads++;
        try {
          const data = await readBody(request, MAX_BROWSER_TRANSFER_BYTES);
          requireValue(sha(data) === digest, 422, "文件校验失败，请重新选择。");
          requireValue(members.get(code, session)?.id === member.id, 403, "成员权限已变化。");
          purgeFiles.run(Date.now());
          const usage = db.prepare("SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS count FROM files").get();
          requireValue(usage.bytes + data.length <= STORAGE_LIMIT && usage.count < 2048, 409, "站点暂存空间不足。");
          const id = token(16);
          const expires = Date.now() + DAY;
          db.prepare("INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(code, id, member.id, name, data.length, digest, expires, expires + 2 * DAY, data);
          return json(201, { id });
        } finally {
          uploads--;
        }
      }
      if (request.method === "GET" && action === "files" && fileId) {
        const file = requireValue(db.prepare("SELECT data FROM files WHERE room = ? AND id = ? AND expires > ?").get(code, fileId, Date.now()), 404, "文件已撤回或到期。");
        response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": file.data.length });
        return response.end(file.data);
      }
      if (post && (action === "revoke" || action === "extend") && !fileId) {
        const input = await readJson(request);
        requireValue(typeof input.id === "string", 400, "文件标识无效。");
        const file = requireValue(db.prepare("SELECT sender, expires, retain_until FROM files WHERE room = ? AND id = ? AND expires > ?").get(code, input.id, Date.now()), 404, "文件已撤回或到期。");
        requireValue(manager || file.sender === member.id, 403, "没有操作该文件的权限。");
        if (action === "revoke") db.prepare("DELETE FROM files WHERE room = ? AND id = ?").run(code, input.id);
        else {
          requireValue(input.expires === file.expires + DAY && input.expires <= file.retain_until, 409, "已达保留上限或到期时间已变化。");
          db.prepare("UPDATE files SET expires = ? WHERE room = ? AND id = ? AND expires = ?").run(input.expires, code, input.id, file.expires);
        }
        return json(200, {});
      }
      throw new RequestError(404, "操作不存在。");
    } catch (error) {
      if (response.destroyed) return;
      if (!request.complete) {
        response.setHeader("Connection", "close");
        request.resume();
      }
      json(error.status ?? 500, error.status ? error.message : "站点处理失败，请稍后重试。");
    }
  };
  const server = tls ? createHttpsServer(tls, handle) : createServer(handle);
  const cleanup = setInterval(purge, 60_000);
  cleanup.unref();
  server.once("close", () => { clearInterval(cleanup); db.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ROOM_DATA, ROOM_HOST = "127.0.0.1", ROOM_PORT = "5176", ROOM_TLS_CERT, ROOM_TLS_KEY } = process.env;
  if (!ROOM_DATA) throw new Error("请将 ROOM_DATA 指向独立的暂存目录。");
  if ((ROOM_HOST !== "127.0.0.1" || ROOM_TLS_KEY || ROOM_TLS_CERT) && !(ROOM_TLS_KEY && ROOM_TLS_CERT)) {
    throw new Error("开放到其他设备前，请配置 ROOM_TLS_CERT 和 ROOM_TLS_KEY。");
  }
  const tls = ROOM_TLS_CERT && { cert: readFileSync(ROOM_TLS_CERT), key: readFileSync(ROOM_TLS_KEY) };
  createRoomServer(ROOM_DATA, tls).listen(Number(ROOM_PORT), ROOM_HOST, () => {
    console.log(`柠猫临时互传区 ${tls ? "https" : "http"}://${ROOM_HOST}:${ROOM_PORT}/rooms`);
  });
}
