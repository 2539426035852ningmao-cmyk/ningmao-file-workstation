import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { confirm } from "./native-room-confirm.mjs";
import { createRoomServer } from "../selfhost/server.mjs";

const [exe, stationBase = tmpdir(), workspaceBase = tmpdir(), count = "80000000"] = process.argv.slice(2);
assert.ok(exe && process.platform === "win32", "Supply a Windows native EXE and optional staging, workspace and byte count arguments.");
const size = Number(count);
const chunk = 4 * 1024 * 1024;
assert.ok(Number.isSafeInteger(size) && size > 64 * 1024 * 1024 && size <= 20_000_000_000);
const sharedVolume = (await stat(stationBase)).dev === (await stat(workspaceBase)).dev;
for (const base of new Set([stationBase, workspaceBase])) {
  const disk = await statfs(base);
  assert.ok(disk.bavail * disk.bsize > size * (sharedVolume ? 4 : 2) + 1024 ** 3, "Insufficient fixture disk space");
}
const reservation = createServer().listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const station = await mkdtemp(join(resolve(stationBase), "ningmao-station-native-"));
const workspace = await mkdtemp(join(resolve(workspaceBase), "ningmao-room-native-"));
const source = join(station, "fixture.bin");
const bound = join(workspace, "bound");
await mkdir(bound);
await writeFile(join(bound, "fixture.bin"), "existing synthetic file");
const fixture = await open(source, "wx");
await fixture.truncate(size);
await fixture.write(Buffer.from("ending native fixture"), 0, 21, size - 21);
await fixture.close();

const server = createRoomServer(join(station, "room"), undefined, size + chunk);
const serve = server.listeners("request")[0];
server.removeListener("request", serve);
const uploads = [];
const downloads = [];
let failUpload = true;
let failDownload = true;
let revokeOnSecondRange;
server.on("request", async (req, res) => {
  if (req.headers["x-offset"] !== undefined) {
    const offset = Number(req.headers["x-offset"]);
    uploads.push(offset);
    if (offset === chunk && failUpload) { failUpload = false; res.destroy(); return; }
  }
  if (req.headers.range) {
    const range = req.headers.range;
    downloads.push(range);
    if (range.startsWith("bytes=" + chunk + "-") && failDownload) { failDownload = false; res.destroy(); return; }
    if (range.startsWith("bytes=" + chunk + "-") && revokeOnSecondRange) {
      const revoke = revokeOnSecondRange;
      revokeOnSecondRange = undefined;
      try { await revoke(); }
      catch { res.writeHead(500).end(); return; }
    }
  }
  void serve(req, res);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const room = await fetch(origin + "/api/rooms", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: '{"name":"合成群主"}',
});
assert.equal(room.status, 201);
const ownerCookie = room.headers.get("set-cookie").split(";")[0];
const code = (await room.json()).code;
const invitation = origin + "/rooms?code=" + code;
const app = spawn(resolve(exe), [], { windowsHide: true, stdio: "ignore", env: {
  ...process.env, NINGMAO_DATA_DIR: workspace, WEBVIEW2_USER_DATA_FOLDER: join(workspace, "webview"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=" + port + " --remote-debugging-address=127.0.0.1",
}});
try {
  let browser;
  for (let tries = 0; tries < 70 && !browser; tries++) {
    assert.equal(app.exitCode, null);
    const debug = "http://127.0.0.1:" + port;
    try { if ((await fetch(debug + "/json/version", { signal: AbortSignal.timeout(1000) })).ok) browser = await chromium.connectOverCDP(debug); }
    catch {}
    if (!browser) await new Promise(done => setTimeout(done, 500));
  }
  assert.ok(browser, "Tauri WebView2 was unavailable");
  let page;
  for (let tries = 0; tries < 40 && !page; tries++) {
    for (const tab of browser.contexts().flatMap(context => context.pages())) {
      if (await tab.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main").catch(() => false)) page = tab;
    }
    if (!page) await new Promise(done => setTimeout(done, 250));
  }
  assert.ok(page);
  const invoke = (command, args) => page.evaluate(({ command, args }) => {
    if (command.startsWith("room_bulk_")) {
      const id = window.__TAURI_INTERNALS__.transformCallback(() => {});
      args.onProgress = "__CHANNEL__:" + id;
    }
    return window.__TAURI_INTERNALS__.invoke(command, args);
  }, { command, args }).catch(error => { throw new Error(String(error)); });
  const created = await invoke("room_create", { station: origin, name: "合成 Windows 群主", approval: true });
  assert.match(created.recovery, /^[a-f0-9]{48}$/);
  const createdCode = new URL(created.invitation).searchParams.get("code");
  assert.match(createdCode, /^[a-f0-9]{32}$/);
  const createdApi = origin + "/api/rooms/" + createdCode;
  assert.equal(new URL(created.invitation).origin, origin);
  const entrant = await fetch(createdApi + "/join", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "合成访客" }),
  });
  assert.equal(entrant.status, 200);
  const entrantCookie = entrant.headers.get("set-cookie").split(";")[0];
  const { member } = await entrant.json();
  assert.equal(member.status, "pending");
  assert.equal((await fetch(createdApi, { headers: { Cookie: entrantCookie } })).status, 403);
  const roomView = await invoke("room_view", { invitation: created.invitation });
  assert.equal(roomView.member.role, "owner");
  assert.equal(roomView.members.find(candidate => candidate.id === member.id)?.status, "pending");
  await invoke("room_decide", { invitation: created.invitation, memberId: member.id, accept: true });
  const admitted = await fetch(createdApi, { headers: { Cookie: entrantCookie } });
  assert.equal(admitted.status, 200);
  assert.equal((await admitted.json()).member.status, "active");
  console.log("Native room created, pending guest approved");

  await invoke("room_join", { invitation, name: "合成 Windows" });
  assert.equal((await invoke("room_view", { invitation: created.invitation })).member.role, "owner");
  const db = new DatabaseSync(join(workspace, "workstation.sqlite3"));
  const shelf = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='shelf' RETURNING next_id-1 AS id").get().id;
  const item = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1 AS id").get().id;
  db.prepare("INSERT INTO shelves (id,name,kind,root) VALUES (?,?,'bound',?)").run(shelf, "合成目标", bound);
  db.prepare("INSERT INTO items (id,shelf_id,path,name,position) VALUES (?,1,?,'fixture.bin',0)").run(item, source);
  db.close();

  const request = { invitation, shelfId: 1, itemId: item, uploadId: randomUUID().replace(/-/g, "") };
  await assert.rejects(invoke("room_bulk_upload", request));
  assert.deepEqual(uploads, [0, chunk]);
  console.log("Upload resumed at", chunk);
  await invoke("room_bulk_upload", request);
  console.log("Station published", size, "bytes");
  assert.deepEqual(uploads.slice(0, 3), [0, chunk, chunk]);
  const files = (await invoke("room_view", { invitation })).files;
  assert.equal(files.length, 1);
  assert.equal(files[0].size, size);
  const ticket = randomUUID();
  const receiver = { invitation, fileId: files[0].id, shelfId: shelf, ticket };
  await Promise.all([
    confirm(app.pid).then(code => assert.equal(code, 0, "Native file confirmation title and body")),
    invoke("room_bulk_receive", receiver),
  ]);
  console.log("Native staged and verified", size, "bytes");
  const receipt = await invoke("web_receive_finish", { ticket });
  assert.equal(receipt.file_name, "fixture (1).bin");
  assert.equal(await readFile(join(bound, "fixture.bin"), "utf8"), "existing synthetic file");
  assert.equal((await stat(join(bound, receipt.file_name))).size, size);
  for (const path of [source, join(bound, receipt.file_name)]) {
    const sha = createHash("sha256");
    for await (const bytes of createReadStream(path)) sha.update(bytes);
    assert.equal(sha.digest("hex"), files[0].digest);
  }
  assert.deepEqual(downloads.slice(0, 3), ["bytes=0-4194303", "bytes=4194304-8388607", "bytes=4194304-8388607"]);
  console.log(JSON.stringify({ size, sha256: files[0].digest, uploadResumed: chunk, downloadRetried: chunk, saved: receipt.file_name }));

  const revocation = { ...receiver, ticket: randomUUID() };
  const before = downloads.length;
  revokeOnSecondRange = async () => {
    const response = await fetch(origin + "/api/rooms/" + code + "/revoke", {
      method: "POST", headers: { Cookie: ownerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ id: files[0].id }),
    });
    assert.equal(response.status, 200);
  };
  await Promise.all([
    confirm(app.pid).then(code => assert.equal(code, 0, "Native file confirmation after first receive")),
    assert.rejects(invoke("room_bulk_receive", revocation), /文件已撤回或到期/),
  ]);
  assert.deepEqual(downloads.slice(before), ["bytes=0-4194303", "bytes=4194304-8388607"]);
  await assert.rejects(invoke("web_receive_finish", { ticket: revocation.ticket }), /已结束|不存在/);
  assert.deepEqual(await readdir(join(workspace, "web-receive-staging")), []);
  const history = new DatabaseSync(join(workspace, "workstation.sqlite3"), { readOnly: true });
  try {
    const latest = history.prepare("SELECT status, staging FROM jobs WHERE shelf_id = ? ORDER BY id DESC LIMIT 1").get(shelf);
    assert.equal(latest.status, "interrupted");
    assert.equal(latest.staging, null);
  } finally {
    history.close();
  }
  assert.deepEqual((await readdir(bound)).sort(), ["fixture (1).bin", "fixture.bin"]);
  assert.equal(await readFile(join(bound, "fixture.bin"), "utf8"), "existing synthetic file");
  console.log("Revoked file: partial stage removed and existing files kept.");

  const ownerSource = join(workspace, "owner-proof.txt");
  const ownerBytes = Buffer.from("Synthetic file from the Windows room owner");
  await writeFile(ownerSource, ownerBytes);
  const ownerDb = new DatabaseSync(join(workspace, "workstation.sqlite3"));
  const ownerItem = ownerDb.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1 AS id").get().id;
  ownerDb.prepare("INSERT INTO items (id,shelf_id,path,name,position) VALUES (?,1,?,'owner-proof.txt',1)").run(ownerItem, ownerSource);
  ownerDb.close();
  await invoke("room_bulk_upload", { invitation: created.invitation, shelfId: 1, itemId: ownerItem, uploadId: randomUUID().replace(/-/g, "") });
  const entrantFiles = await fetch(createdApi, { headers: { Cookie: entrantCookie } }).then(response => response.json());
  const delivered = entrantFiles.files.find(file => file.name === "owner-proof.txt");
  assert.ok(delivered);
  const saved = await fetch(createdApi + "/files/" + delivered.id, { headers: { Cookie: entrantCookie } });
  assert.equal(saved.status, 200);
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()), ownerBytes);
  console.log("Admitted guest received the file published by the Windows room owner");
} finally {
  if (app.exitCode === null) { const exit = once(app, "exit"); app.kill(); await exit; }
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(station, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
