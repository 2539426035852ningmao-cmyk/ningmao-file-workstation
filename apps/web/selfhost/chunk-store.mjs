import { createHash } from "node:crypto";
import { closeSync, createReadStream, mkdirSync, openSync, rmSync, statfsSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_BULK_BYTES = 20_000_000_000;
const LARGE_BYTES = 10_000_000_000;
const HOUR = 3_600_000;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const validDigest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function retention(size) {
  return size >= LARGE_BYTES ? { hours: 6, maxHours: 24 } : { hours: 24, maxHours: 72 };
}

export class ChunkError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function check(condition, status, message) {
  if (!condition) throw new ChunkError(status, message);
}

export class ChunkStore {
  #db;
  #root;
  #quota;
  #active = new Set();

  constructor(root, quota) {
    check(Number.isSafeInteger(quota) && quota > 0, 500, "站点暂存配额无效。");
    this.#root = root;
    this.#quota = quota;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.#db = new DatabaseSync(join(root, "chunks.sqlite"));
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY, room TEXT NOT NULL, member TEXT NOT NULL,
        name TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL,
        offset INTEGER NOT NULL DEFAULT 0,
        touched INTEGER NOT NULL, expires INTEGER, retain_until INTEGER, revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chunk_digests (
        id TEXT NOT NULL, offset INTEGER NOT NULL, digest TEXT NOT NULL,
        PRIMARY KEY (id, offset)
      )
    `);
  }

  close() { this.#db.close(); }

  #file(id) { return join(this.#root, id + ".data"); }

  #row(id) {
    check(typeof id === "string" && /^[a-f0-9]{32}$/.test(id), 400, "文件编号无效。");
    const row = this.#db.prepare("SELECT * FROM chunks WHERE id = ?").get(id);
    check(row, 404, "找不到互传文件。");
    return row;
  }

  #own(id, member) {
    const row = this.#row(id);
    check(row.member === member, 403, "没有权限操作此上传。");
    return row;
  }

  open({ room, member, request, size, digest, name = "file" }) {
    check(Number.isSafeInteger(size) && size >= 0 && size <= MAX_BULK_BYTES, 413, "临时互传单文件最多 20 GB。");
    check(typeof request === "string" && /^[a-f0-9]{32}$/.test(request) && validDigest(digest)
      && typeof name === "string" && name.length > 0 && name.length <= 100, 400, "上传请求无效。");
    const id = hash(JSON.stringify([room, member, request])).slice(0, 32);
    const current = this.#db.prepare("SELECT * FROM chunks WHERE id = ?").get(id);
    if (current) {
      check(current.size === size && current.digest === digest && current.name === name, 409, "续传的源文件已变化。");
      check(!current.revoked && (current.expires === null || current.expires > Date.now()), 410, "文件已撤回或到期。");
      return current;
    }
    const reservations = this.#db.prepare("SELECT COALESCE(SUM(size),0) AS total, COALESCE(SUM(size-offset),0) AS remaining, COUNT(*) AS count FROM chunks WHERE revoked = 0").get();
    check(reservations.count < 2048 && size <= this.#quota - reservations.total, 409, "站点暂存配额不足。");
    const disk = statfsSync(this.#root);
    check(size <= disk.bavail * disk.bsize - reservations.remaining, 507, "磁盘空间不足。");
    const path = this.#file(id);
    try {
      closeSync(openSync(path, "wx", 0o600));
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // The only file without a database row is from an interrupted zero-byte reservation.
      rmSync(path);
      closeSync(openSync(path, "wx", 0o600));
    }
    try {
      this.#db.prepare("INSERT INTO chunks (id, room, member, name, size, digest, touched) VALUES (?,?,?,?,?,?,?)")
        .run(id, room, member, name, size, digest, Date.now());
    } catch (error) {
      rmSync(path, { force: true });
      throw error;
    }
    return this.#row(id);
  }

  status(id, member) { return this.#own(id, member); }

  async append(id, member, offset, bytes, digest) {
    const row = this.#own(id, member);
    check(!row.revoked && row.expires === null, 409, "文件已经发布或撤回。");
    check(offset === row.offset, 409, "上传偏移已变化，请查询进度后续传。");
    check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= CHUNK_BYTES
      && bytes.length === Math.min(CHUNK_BYTES, row.size - offset), 413, "分块长度超出允许范围。");
    check(validDigest(digest) && hash(bytes) === digest, 422, "分块校验失败。");
    check(!this.#active.has(id), 409, "同一上传正在操作。");
    this.#active.add(id);
    try {
      const target = await open(this.#file(id), "r+");
      try {
        await target.truncate(offset);
        const written = await target.write(bytes, 0, bytes.length, offset);
        check(written.bytesWritten === bytes.length, 507, "磁盘未写完整分块。");
        await target.sync();
      } finally {
        await target.close();
      }
      this.#db.exec("BEGIN");
      try {
        this.#db.prepare("INSERT INTO chunk_digests VALUES (?,?,?)").run(id, offset, digest);
        this.#db.prepare("UPDATE chunks SET offset = ?, touched = ? WHERE id = ?")
          .run(offset + bytes.length, Date.now(), id);
        this.#db.exec("COMMIT");
      } catch (error) {
        this.#db.exec("ROLLBACK");
        throw error;
      }
      return this.#row(id);
    } finally {
      this.#active.delete(id);
    }
  }

  async publish(id, member, now = Date.now()) {
    const row = this.#own(id, member);
    if (row.expires !== null) {
      check(!row.revoked && now < row.expires, 410, "文件已撤回或到期。");
      return row;
    }
    check(row.offset === row.size, 409, "文件尚未收齐。");
    check(!this.#active.has(id), 409, "同一上传正在操作。");
    this.#active.add(id);
    try {
      const digest = createHash("sha256");
      let count = 0;
      for await (const bytes of createReadStream(this.#file(id))) {
        count += bytes.length;
        check(count <= row.size, 422, "完整文件长度校验失败。");
        digest.update(bytes);
      }
      check(count === row.size && digest.digest("hex") === row.digest, 422, "完整文件校验失败。");
      const { hours, maxHours } = retention(row.size);
      this.#db.prepare("UPDATE chunks SET expires = ?, retain_until = ? WHERE id = ?")
        .run(now + hours * HOUR, now + maxHours * HOUR, id);
      return this.#row(id);
    } finally {
      this.#active.delete(id);
    }
  }

  entry(id, room, now = Date.now()) {
    const row = this.#row(id);
    check(!row.revoked && row.room === room && row.expires !== null && now < row.expires, 404, "文件尚不可下载或已到期。");
    return row;
  }

  checksum(id, offset) {
    return this.#db.prepare("SELECT digest FROM chunk_digests WHERE id = ? AND offset = ?").get(id, offset)?.digest;
  }

  path(id, room, now = Date.now()) {
    return this.#file(this.entry(id, room, now).id);
  }

  list(room, now = Date.now()) {
    return this.#db.prepare(`SELECT id, name, member AS sender, size, digest, expires, retain_until, 1 AS chunked
      FROM chunks WHERE room = ? AND revoked = 0 AND expires > ? ORDER BY touched DESC`).all(room, now);
  }

  hasRoom(room) {
    return Boolean(this.#db.prepare("SELECT 1 FROM chunks WHERE room = ? LIMIT 1").get(room));
  }

  extend(row, expires) {
    const add = retention(row.size).hours * HOUR;
    check(expires === row.expires + add && expires <= row.retain_until, 409, "已达保留上限或到期时间已变化。");
    this.#db.prepare("UPDATE chunks SET expires = ? WHERE id = ?").run(expires, row.id);
  }

  revoke(row) {
    this.#db.prepare("UPDATE chunks SET revoked = 1, touched = ? WHERE id = ?").run(Date.now(), row.id);
    try {
      rmSync(this.#file(row.id), { force: true });
    } catch (error) {
      if (error.code !== "EBUSY" && error.code !== "EPERM") throw error;
    }
  }

  purge(now = Date.now()) {
    const candidates = this.#db.prepare(`SELECT id, revoked, touched, expires FROM chunks
      WHERE revoked = 1 OR expires <= ? OR (expires IS NULL AND touched <= ?)`).all(now, now - 24 * HOUR);
    for (const row of candidates) {
      if (this.#active.has(row.id)) continue;
      try {
        rmSync(this.#file(row.id), { force: true });
        if (!row.revoked && row.expires !== null) {
          this.#db.prepare("UPDATE chunks SET revoked = 1, touched = ? WHERE id = ?").run(now, row.id);
        } else if (!row.revoked || row.touched <= now - 7 * 24 * HOUR) {
          this.#db.prepare("DELETE FROM chunk_digests WHERE id = ?").run(row.id);
          this.#db.prepare("DELETE FROM chunks WHERE id = ?").run(row.id);
        }
      } catch (error) {
        if (error.code !== "EBUSY" && error.code !== "EPERM") throw error;
      }
    }
  }
}
