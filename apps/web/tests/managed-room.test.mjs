import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../selfhost/managed-room.mjs", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const MiB = 1024 * 1024;

test("desktop-managed station restores invitation, verified files and partial uploads until expiry", { timeout: 20_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "柠猫-站点-"));
  let child;
  async function start(port = 0) {
    child = spawn(process.execPath, [entry, root, String(10 * MiB), String(port)], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "inherit"],
    });
    const [ready] = await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(([code]) => { throw new Error(`Station exited with code ${code}`); }),
    ]);
    assert.match(ready.toString(), /^READY \d+\s*$/);
    return Number(ready.toString().trim().split(" ")[1]);
  }
  async function stop() {
    const exit = once(child, "exit");
    child.stdin.end();
    const [code] = await exit;
    assert.equal(code, 0);
    child = undefined;
  }
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, "exit");
      child.kill();
      await exit;
    }
    await rm(root, { recursive: true, force: true });
  });

  const port = await start();
  const origin = `http://127.0.0.1:${port}`;
  let cookie = "";
  async function request(path, body, headers) {
    const json = body !== undefined && !Buffer.isBuffer(body);
    const response = await fetch(origin + "/api/rooms" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, ...(json ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json ? JSON.stringify(body) : body,
    });
    cookie ||= response.headers.get("set-cookie")?.split(";")[0] ?? "";
    return response;
  }
  const created = await request("", { name: "合成房主", approval: true });
  assert.equal(created.status, 201);
  const { code } = await created.json();
  const room = "/" + code;
  const body = Buffer.from("合成文档");
  assert.equal((await request(room + "/files", body)).status, 409);
  const open = (name, id, bytes) => request(room + "/bulk", {
    name, request: id.repeat(32), digest: digest(bytes), size: bytes.length,
  });
  const append = (id, offset, bytes) => request(room + "/bulk/" + id, bytes, {
    "X-Offset": String(offset), "X-SHA256": digest(bytes),
  });
  const publish = id => request(room + "/bulk/" + id + "/publish", {});
  const file = await (await open("合成文件.txt", "a", body)).json();
  assert.equal((await append(file.id, 0, body)).status, 200);
  const published = await publish(file.id);
  assert.equal(published.status, 200);
  const { expires } = await published.json();
  assert.ok(expires - Date.now() > 23 * 60 * 60 * 1000);

  const partial = Buffer.alloc(4 * MiB + 1, 7);
  const task = await (await open("断点续传.bin", "b", partial)).json();
  assert.equal((await append(task.id, 0, partial.subarray(0, 4 * MiB))).status, 200);
  assert.equal((await open("配额不足.bin", "c", Buffer.alloc(6 * MiB))).status, 409);
  await stop();
  // Undici may report the just-closed connection once before opening a new socket.
  await assert.rejects(() => request(room));
  assert.equal(await start(port), port);
  const restored = await (await request(room)).json();
  assert.equal(restored.member.name, "合成房主");
  assert.deepEqual(restored.files.map(entry => [entry.id, entry.expires]), [[file.id, expires]]);
  const download = await request(room + "/files/" + file.id);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), body);
  const stored = await (await open("断点续传.bin", "b", partial)).json();
  assert.equal(stored.id, task.id);
  assert.equal(stored.offset, 4 * MiB);
  assert.equal((await append(stored.id, stored.offset, partial.subarray(stored.offset))).status, 200);
  assert.equal((await publish(stored.id)).status, 200);
  await stop();

  const db = new DatabaseSync(join(root, "chunk-files", "chunks.sqlite"));
  db.prepare("UPDATE chunks SET expires = ? WHERE id = ?").run(Date.now() - 1, file.id);
  db.close();
  await start(port);
  assert.equal((await request(room + "/files/" + file.id)).status, 404);
  const current = await (await request(room)).json();
  assert.deepEqual(current.files.map(entry => entry.id), [task.id]);
  await stop();
});
