import { randomBytes } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { avatarSize, isAnimalAvatar } from "../src/animal-avatars.mjs";

const stride = avatarSize * 4;

function chunk(name, bytes) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(bytes.length);
  header.write(name, 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(bytes, crc32(header.subarray(4))));
  return Buffer.concat([header, bytes, checksum]);
}

function pngAvatar(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(avatarSize);
  header.writeUInt32BE(avatarSize, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((stride + 1) * avatarSize);
  for (let y = 0; y < avatarSize; y++) pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function createAvatars(db, { readBody, readJson, requireValue }) {
  db.exec(`CREATE TABLE IF NOT EXISTS account_avatars (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    preset TEXT, photo_id TEXT UNIQUE, photo BLOB
  )`);
  const byAccount = db.prepare("SELECT COALESCE(preset,photo_id) AS avatar FROM account_avatars WHERE account_id=?");
  const byPhoto = db.prepare("SELECT account_id, photo FROM account_avatars WHERE photo_id=?");
  const upsert = db.prepare(`INSERT INTO account_avatars (account_id,preset,photo_id,photo) VALUES(?,?,?,?)
    ON CONFLICT(account_id) DO UPDATE SET preset=excluded.preset,photo_id=excluded.photo_id,photo=excluded.photo`);
  const remove = db.prepare("DELETE FROM account_avatars WHERE account_id=?");

  return {
    descriptor(accountId) { return byAccount.get(accountId)?.avatar; },
    async update(request, accountId, current) {
      if (request.headers["content-type"] === "application/octet-stream") {
        const pixels = await readBody(request, stride * avatarSize);
        requireValue(pixels.length === stride * avatarSize, 400, "头像图片尺寸无效。");
        requireValue(current()?.id === accountId, 401, "登录已失效，请重新登录。");
        upsert.run(accountId, null, randomBytes(16).toString("hex"), pngAvatar(pixels));
      } else {
        const { preset } = await readJson(request);
        requireValue(preset === null || isAnimalAvatar(preset), 400, "请选择一个内置头像。");
        requireValue(current()?.id === accountId, 401, "登录已失效，请重新登录。");
        if (preset === null) remove.run(accountId);
        else upsert.run(accountId, preset, null, null);
      }
    },
    send(response, id, canView) {
      const record = byPhoto.get(id);
      requireValue(record && canView(record.account_id), 404, "找不到头像。");
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": record.photo.length,
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      });
      response.end(record.photo);
    },
  };
}
