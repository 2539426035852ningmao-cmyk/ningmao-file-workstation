import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createReadStream, mkdirSync, readFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MAX_BROWSER_TRANSFER_BYTES, safeFileName } from "../src/file-preparation.mjs";
import { CHUNK_BYTES, ChunkStore } from "./chunk-store.mjs";
import { RoomSources } from "./room-sources.mjs";

const DAY = 86_400_000;
const STORAGE_LIMIT = 512 * 1024 * 1024;
const MEMBER_LIMIT = 5;
const FULL_ROOM = "文件群已满（最多 5 人，含群主）。";
const DUPLICATE_MEMBER_NAME = "此名称已被使用，请换一个显示名称。";
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

async function readJson(request, limit = 4096) {
  requireValue(request.headers["content-type"] === "application/json", 415, "请求格式无效。");
  try {
    const data = JSON.parse(await readBody(request, limit));
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

const memberNameKey = name => name.normalize("NFKC").trim().toLowerCase();
const managesRoom = member => member.role === "owner" || member.role === "admin";

export function createRoomServer(directory, tls, bulkQuota = 0, { managed = false } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(directory, "rooms.sqlite"));
  const sources = new RoomSources();
  const bulk = bulkQuota ? new ChunkStore(resolve(directory, "chunk-files"), bulkQuota) : null;
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
      CREATE TABLE IF NOT EXISTS uploads (
        room TEXT REFERENCES rooms ON DELETE CASCADE, id TEXT PRIMARY KEY,
        name TEXT NOT NULL, digest TEXT NOT NULL
      );
  `);
  const members = db.prepare("SELECT id, name, role, status FROM members WHERE room = ? AND session = ?");
  const addMember = db.prepare("INSERT INTO members VALUES (?, ?, ?, ?, ?, ?)");
  const activeCount = db.prepare("SELECT COUNT(*) AS count FROM members WHERE room = ? AND status = 'active'");
  const memberById = db.prepare("SELECT name, role, status FROM members WHERE room = ? AND id = ?");
  const reservedNames = db.prepare("SELECT name FROM members WHERE room = ? AND (status = 'active' OR ? AND status = 'pending')");
  function requireUnusedName(code, name, includePending) {
    const key = memberNameKey(name);
    requireValue(!reservedNames.all(code, Number(includePending)).some(member => memberNameKey(member.name) === key),
      409, DUPLICATE_MEMBER_NAME);
  }
  const changeStatus = db.prepare("UPDATE members SET status = ?, role = 'member' WHERE room = ? AND id = ?");
  const purgeFiles = db.prepare("DELETE FROM files WHERE expires <= ?");
  const oldRooms = db.prepare("SELECT code FROM rooms WHERE created < ? AND NOT EXISTS (SELECT 1 FROM files WHERE files.room = rooms.code)");
  const deleteRoom = db.prepare("DELETE FROM rooms WHERE code = ?");
  function purge() {
    purgeFiles.run(Date.now());
    bulk?.purge();
    for (const { code } of oldRooms.all(Date.now() - 7 * DAY)) {
      if (!bulk?.hasRoom(code)) deleteRoom.run(code);
    }
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
      if (managed) {
        requireValue(request.headers.host === `127.0.0.1:${request.socket.localPort}`, 403, "此站点仅供本机使用。");
      }
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

      const match = /^\/api\/rooms\/([a-f0-9]{32})(?:\/(join|recover|decide|promote|leave|remove|files|revoke|extend|bulk|peers|sources)(?:\/([a-f0-9]{32}))?(?:\/(publish))?)?$/.exec(pathname);
      requireValue(match, 404, "页面不存在。");
      const [, code, action, fileId, operation] = match;
      requireValue(!operation || action === "bulk" && fileId, 404, "操作不存在。");
      const room = requireValue(db.prepare("SELECT * FROM rooms WHERE code = ?").get(code), 404, "找不到这个互传区。");
      let member = members.get(code, session);

      if (post && action === "join" && !fileId) {
        const input = await readJson(request);
        member = members.get(code, session);
        requireValue(member?.status !== "removed", 403, "你已被移出这个文件群。");
        if (!member || member.status === "left") {
          requireValue(Date.now() < room.created + DAY, 410, "邀请码已过期。");
          requireValue(activeCount.get(code).count < MEMBER_LIMIT, 409, FULL_ROOM);
          const name = validName(input.name);
          requireUnusedName(code, name, true);
          const status = room.approval ? "pending" : "active";
          let joiningSession = session;
          if (member) {
            db.prepare("UPDATE members SET status = ?, name = ? WHERE room = ? AND session = ?").run(status, name, code, session);
          } else {
            requireValue(db.prepare("SELECT COUNT(*) AS count FROM members WHERE room = ?").get(code).count < 64, 409, "加入记录已满，请联系群主。");
            joiningSession = identify();
            addMember.run(code, joiningSession, token(12), name, "member", status);
          }
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
      const currentMember = () => {
        const current = members.get(code, session);
        return requireValue(current?.id === member?.id && current?.status === "active" && current, 403, "成员权限已变化。");
      };
      requireValue(member?.status === "active", 403, "请先加入互传区。");
      if (!action && request.method === "GET") {
        return json(200, {
          code, member, memberLimit: MEMBER_LIMIT, inviteExpires: room.created + DAY, bulk: Boolean(bulk), directed: Boolean(bulk),
          members: db.prepare(`SELECT id, name, role, status FROM members
            WHERE room = ? AND (status = 'active' OR ? AND status = 'pending') ORDER BY rowid`).all(code, Number(managesRoom(member))),
          files: [
            ...(bulk?.list(code, member.id) ?? []),
            ...db.prepare(`SELECT id, sender, name, size, digest, expires, retain_until FROM files
              WHERE room = ? AND expires > ? ORDER BY rowid DESC`).all(code, Date.now()),
          ],
        });
      }
      if (action === "peers" && fileId && bulk) {
        if (request.method === "GET") {
          requireValue(sources.connect(code, member.id, session, fileId, response, () => members.get(code, session)?.status === "active"), 429, "在线供件连接已满。");
          return;
        }
        if (post) {
          const input = await readJson(request, 32 * 1024);
          currentMember();
          if (input.heartbeat === true) {
            requireValue(sources.heartbeat(code, session, fileId), 409, "当前供件来源不可用。");
            return json(200, {});
          }
          const item = bulk.entryFor(input.file, code, member.id);
          const accepted = typeof input.enabled === "boolean"
            ? sources.advertise(code, session, fileId, input.file, input.enabled)
            : sources.relay(code, session, fileId, input, target => bulk.allows(item, target));
          requireValue(accepted, 409, "当前供件来源不可用。");
          return json(200, {});
        }
      }
      if (action === "sources" && fileId && bulk && request.method === "GET") {
        const item = bulk.entryFor(fileId, code, member.id);
        const offset = Number(url.searchParams.get("offset"));
        requireValue(Number.isSafeInteger(offset) && offset >= 0 && offset < item.size && offset % CHUNK_BYTES === 0,
          400, "分块偏移无效。");
        return json(200, {
          sources: sources.list(code, fileId, url.searchParams.get("client")),
          digest: bulk.checksum(fileId, offset) ?? null,
        });
      }
      if (action === "bulk") {
        requireValue(bulk, 404, "站点尚未开启分块暂存。");
        function uploadReceipt(row) {
          return { id: row.id, size: row.size, offset: row.offset, expires: row.expires, chunkBytes: CHUNK_BYTES,
            recipients: row.recipients === null ? null : JSON.parse(row.recipients) };
        }
        if (post && !fileId) {
          const input = await readJson(request);
          currentMember();
          requireValue(safeFileName(input.name), 400, "文件名无效。");
          let recipients = null;
          if (input.recipients != null) {
            requireValue(Array.isArray(input.recipients) && input.recipients.length > 0
              && input.recipients.length < MEMBER_LIMIT && input.recipients.every(id =>
                typeof id === "string" && /^[a-f0-9]{24}$/.test(id) && id !== member.id
                  && memberById.get(code, id)?.status === "active"),
            400, "请选择仍在文件群里的收件人。");
            recipients = [...new Set(input.recipients)].sort();
          }
          return json(200, uploadReceipt(bulk.open({ room: code, member: member.id, name: input.name,
            request: input.request, size: input.size, digest: input.digest, recipients })));
        }
        requireValue(fileId, 404, "文件编号不存在。");
        const current = bulk.status(fileId, member.id, code);
        if (post && operation === "publish") return json(200, uploadReceipt(await bulk.publish(fileId, member.id, Date.now(), currentMember)));
        if (request.method === "GET" && !operation) return json(200, uploadReceipt(current));
        if (post && !operation) {
          requireValue(uploads < 2, 429, "当前上传较多，请稍后重试。");
          uploads++;
          try {
            const bytes = await readBody(request, CHUNK_BYTES);
            currentMember();
            return json(200, uploadReceipt(await bulk.append(fileId, member.id, Number(request.headers["x-offset"]),
              bytes, request.headers["x-sha256"])));
          } finally {
            uploads--;
          }
        }
      }
      if (post && action === "decide" && !fileId) {
        const input = await readJson(request);
        requireValue(managesRoom(currentMember()), 403, "只有群主或管理员可以批准加入。");
        requireValue(typeof input.id === "string" && typeof input.accept === "boolean", 400, "请求内容无效。");
        if (input.accept) {
          const target = memberById.get(code, input.id);
          if (target?.status === "pending") {
            requireValue(activeCount.get(code).count < MEMBER_LIMIT, 409, FULL_ROOM);
            requireUnusedName(code, target.name, false);
          }
        }
        db.prepare("UPDATE members SET status = ? WHERE room = ? AND id = ? AND status = 'pending'").run(input.accept ? "active" : "denied", code, input.id);
        return json(200, {});
      }
      if (post && action === "promote" && !fileId) {
        const input = await readJson(request);
        requireValue(currentMember().role === "owner", 403, "只有群主可以调整管理员。");
        requireValue(typeof input.id === "string" && typeof input.enabled === "boolean", 400, "请求内容无效。");
        const count = db.prepare("SELECT COUNT(*) AS count FROM members WHERE room = ? AND role = 'admin'").get(code).count;
        requireValue(!input.enabled || count < 3, 409, "最多可以指定三名管理员。");
        db.prepare("UPDATE members SET role = ? WHERE room = ? AND id = ? AND role <> 'owner' AND status = 'active'").run(input.enabled ? "admin" : "member", code, input.id);
        return json(200, {});
      }
      if (post && !fileId && action === "leave") {
        requireValue(member.role !== "owner", 403, "群主须保留管理权限。");
        changeStatus.run("left", code, member.id);
        return json(200, {});
      }
      if (post && !fileId && action === "remove") {
        const input = await readJson(request);
        const actor = currentMember();
        requireValue(managesRoom(actor), 403, "只有群主或管理员可以移出成员。");
        requireValue(typeof input.id === "string", 400, "成员编号无效。");
        const target = memberById.get(code, input.id);
        requireValue(target?.status === "active", 404, "找不到该成员。");
        requireValue(input.id !== actor.id && (target.role === "member"
          || (target.role === "admin" && actor.role === "owner")), 403, "没有权限移出该成员。");
        changeStatus.run("removed", code, input.id);
        return json(200, {});
      }
      if (post && action === "files" && !fileId) {
        requireValue(!managed, 409, "请使用支持暂存配额的客户端发送文件。");
        let name;
        try { name = validName(decodeURIComponent(request.headers["x-file-name"] ?? "")); }
        catch (error) { if (error instanceof URIError) throw new RequestError(400, "文件名无效。"); throw error; }
        requireValue(safeFileName(name), 400, "文件名无效，请先修改文件名。");
        const digest = request.headers["x-sha256"];
        requireValue(typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest), 400, "缺少文件校验值。");
        const uploadId = request.headers["x-upload-id"];
        requireValue(uploadId === undefined || (typeof uploadId === "string" && /^[a-f0-9]{32}$/.test(uploadId)), 400, "发送编号无效。");
        const id = uploadId ? sha(code + member.id + uploadId).slice(0, 32) : token(16);
        requireValue(uploads < 2, 429, "当前上传较多，请稍后重试。");
        uploads++;
        try {
          const data = await readBody(request, MAX_BROWSER_TRANSFER_BYTES);
          requireValue(sha(data) === digest, 422, "文件校验失败，请重新选择。");
          currentMember();
          purgeFiles.run(Date.now());
          if (uploadId) {
            const prior = db.prepare("SELECT name, digest FROM uploads WHERE room = ? AND id = ?").get(code, id);
            if (prior) {
              requireValue(prior.name === name && prior.digest === digest, 409, "待恢复任务对应的文件已变化。");
              requireValue(db.prepare("SELECT 1 FROM files WHERE room = ? AND id = ?").get(code, id), 410, "该发送记录已撤回或到期。");
              return json(200, { id });
            }
            requireValue(db.prepare("SELECT COUNT(*) AS count FROM uploads WHERE room = ?").get(code).count < 4096, 409, "互传区发送记录已满。");
          }
          const usage = db.prepare("SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS count FROM files").get();
          requireValue(usage.bytes + data.length <= STORAGE_LIMIT && usage.count < 2048, 409, "站点暂存空间不足。");
          const expires = Date.now() + DAY;
          db.exec("BEGIN");
          try {
            if (uploadId) db.prepare("INSERT INTO uploads VALUES (?, ?, ?, ?)").run(code, id, name, digest);
            db.prepare("INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(code, id, member.id, name, data.length, digest, expires, expires + 2 * DAY, data);
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
          return json(201, { id });
        } finally {
          uploads--;
        }
      }
      if (request.method === "GET" && action === "files" && fileId) {
        const file = db.prepare("SELECT data FROM files WHERE room = ? AND id = ? AND expires > ?").get(code, fileId, Date.now());
        if (file) {
          response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": file.data.length });
          return response.end(file.data);
        }
        requireValue(bulk, 404, "文件已撤回或到期。");
        const item = bulk.entryFor(fileId, code, member.id);
        if (item.size === 0) {
          response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": 0 });
          return response.end();
        }
        const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
        const start = range ? Number(range[1]) : 0;
        const end = range ? Number(range[2]) : item.size - 1;
        requireValue((!request.headers.range || range) && start <= end && end < item.size, 416, "下载范围无效。");
        const headers = { "Content-Type": "application/octet-stream", "Content-Length": end - start + 1, "Accept-Ranges": "bytes" };
        if (range) headers["Content-Range"] = `bytes ${start}-${end}/${item.size}`;
        response.writeHead(range ? 206 : 200, headers);
        await pipeline(createReadStream(bulk.path(fileId, code), { start, end }), response);
        return;
      }
      if (post && (action === "revoke" || action === "extend") && !fileId) {
        const input = await readJson(request);
        const manager = managesRoom(currentMember());
        requireValue(typeof input.id === "string", 400, "文件标识无效。");
        const file = db.prepare("SELECT sender, expires, retain_until FROM files WHERE room = ? AND id = ? AND expires > ?").get(code, input.id, Date.now());
        if (!file && bulk) {
          const row = bulk.entryFor(input.id, code, member.id);
          requireValue(manager || row.member === member.id, 403, "没有操作该文件的权限。");
          if (action === "revoke") {
            bulk.revoke(row);
            sources.revoke(code, row.id);
          }
          else bulk.extend(row, input.expires);
          return json(200, {});
        }
        requireValue(file, 404, "文件已撤回或到期。");
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
      if (response.headersSent) { response.destroy(); return; }
      if (!request.complete) {
        response.setHeader("Connection", "close");
        request.resume();
      }
      json(error.status ?? 500, error.status ? error.message : "站点处理失败，请稍后重试。");
    }
  };
  const server = tls ? createHttpsServer(tls, handle) : createServer(handle);
  const close = server.close.bind(server);
  server.close = callback => { sources.close(); return close(callback); };
  const cleanup = setInterval(purge, 60_000);
  cleanup.unref();
  server.once("close", () => { clearInterval(cleanup); bulk?.close(); db.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ROOM_DATA, ROOM_HOST = "127.0.0.1", ROOM_PORT = "5176", ROOM_TLS_CERT, ROOM_TLS_KEY } = process.env;
  if (!ROOM_DATA) throw new Error("请将 ROOM_DATA 指向独立的暂存目录。");
  if ((ROOM_HOST !== "127.0.0.1" || ROOM_TLS_KEY || ROOM_TLS_CERT) && !(ROOM_TLS_KEY && ROOM_TLS_CERT)) {
    throw new Error("开放到其他设备前，请配置 ROOM_TLS_CERT 和 ROOM_TLS_KEY。");
  }
  const tls = ROOM_TLS_CERT && { cert: readFileSync(ROOM_TLS_CERT), key: readFileSync(ROOM_TLS_KEY) };
  createRoomServer(ROOM_DATA, tls, Number(process.env.ROOM_BULK_QUOTA_BYTES ?? 0)).listen(Number(ROOM_PORT), ROOM_HOST, () => {
    console.log(`柠猫临时互传区 ${tls ? "https" : "http"}://${ROOM_HOST}:${ROOM_PORT}/rooms`);
  });
}
