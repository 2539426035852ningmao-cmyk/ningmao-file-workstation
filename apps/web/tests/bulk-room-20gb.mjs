import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm, stat, statfs } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRoomServer } from "../selfhost/server.mjs";
import { CHUNK_BYTES, MAX_BULK_BYTES } from "../selfhost/chunk-store.mjs";

const [stationDirectory, receiveDirectory] = process.argv.slice(2);
assert.ok(stationDirectory && receiveDirectory, "Usage: node tests/bulk-room-20gb.mjs STATION_DIRECTORY RECEIVE_DIRECTORY");
const sharedDisk = (await stat(stationDirectory)).dev === (await stat(receiveDirectory)).dev;
const needed = (sharedDisk ? 2 : 1) * MAX_BULK_BYTES + 1024 ** 3;
for (const dir of [stationDirectory, receiveDirectory]) {
  const { bavail, bsize } = await statfs(dir);
  assert.ok(bavail * bsize > needed, "Insufficient staging or receive disk space.");
}
const size = MAX_BULK_BYTES;
const piece = Buffer.alloc(CHUNK_BYTES, 47);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const source = createHash("sha256");
for (let offset = 0; offset < size; offset += piece.length) {
  source.update(piece.subarray(0, Math.min(piece.length, size - offset)));
}
const expected = source.digest("hex");
const root = await mkdtemp(join(resolve(stationDirectory), "ningmao-station-"));
const out = await mkdtemp(join(resolve(receiveDirectory), "ningmao-receive-"));
let server;
let base;
let resumedOffset;

async function start() {
  server = createRoomServer(root, undefined, size + CHUNK_BYTES).listen(0, "127.0.0.1");
  await once(server, "listening");
  base = "http://127.0.0.1:" + server.address().port + "/api/rooms";
}
async function stop() {
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
async function request(path, options) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(120_000), ...options });
  assert.ok(response.ok, response.ok ? "" : response.status + " " + await response.text());
  return response;
}
const post = (data, cookie) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(data),
});
const cookieOf = response => response.headers.get("set-cookie").split(";")[0];

try {
  await start();
  const created = await request("", post({ name: "合成发送端" }));
  const owner = cookieOf(created);
  const room = "/" + (await created.json()).code;
  const manifest = { name: "20gb.bin", size, digest: expected, request: "8".repeat(32) };
  let receipt = await (await request(room + "/bulk", post(manifest, owner))).json();
  const upload = room + "/bulk/" + receipt.id;
  const pieceDigest = digest(piece);
  while (receipt.offset < size) {
    const offset = receipt.offset;
    const part = piece.subarray(0, Math.min(piece.length, size - offset));
    receipt = await (await request(upload, {
      method: "POST",
      headers: { Cookie: owner, "X-Offset": String(offset), "X-SHA256": part.length === piece.length ? pieceDigest : digest(part) },
      body: part,
    })).json();
    assert.equal(receipt.offset, offset + part.length);
    if (!resumedOffset && receipt.offset >= 10_000_000_000) {
      await stop();
      await start();
      const recovered = await (await request(room + "/bulk", post(manifest, owner))).json();
      assert.equal(recovered.offset, receipt.offset);
      resumedOffset = recovered.offset;
      console.log("Recovered station offset:", resumedOffset);
    }
  }
  const startPublish = Date.now();
  const published = await (await request(upload + "/publish", { method: "POST", headers: { Cookie: owner } })).json();
  assert.ok(published.expires >= startPublish + 6 * 3_600_000);
  assert.ok(published.expires <= Date.now() + 6 * 3_600_000);

  const guest = cookieOf(await request(room + "/join", post({ name: "合成接收端" })));
  const file = join(out, "received.bin");
  const sink = await open(file, "wx");
  try {
    for (let offset = 0; offset < size; offset += piece.length) {
      const end = Math.min(size, offset + piece.length) - 1;
      const response = await request(room + "/files/" + published.id, { headers: { Cookie: guest, Range: `bytes=${offset}-${end}` } });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("content-range"), `bytes ${offset}-${end}/${size}`);
      const received = Buffer.from(await response.arrayBuffer());
      assert.equal(received.length, end - offset + 1);
      const written = await sink.write(received, 0, received.length, offset);
      assert.equal(written.bytesWritten, received.length);
    }
    await sink.sync();
  } finally {
    await sink.close();
  }
  assert.equal((await stat(file)).size, size);
  const receiver = createHash("sha256");
  for await (const bytes of createReadStream(file)) receiver.update(bytes);
  const sha256 = receiver.digest("hex");
  assert.equal(sha256, expected);
  console.log(JSON.stringify({ size, sha256, resumedOffset, retentionHours: 6 }));
} finally {
  if (server?.listening) await stop();
  await rm(root, { recursive: true, force: true });
  await rm(out, { recursive: true, force: true });
}
