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
  await invoke("room_join", { invitation, name: "合成 Windows" });
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
} finally {
  if (app.exitCode === null) { const exit = once(app, "exit"); app.kill(); await exit; }
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(station, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
function confirm(pid) {
const ps="Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes\nAdd-Type @'\nusing System;\nusing System.Runtime.InteropServices;\npublic static class TestDialogClick {\n [DllImport(\"user32.dll\",SetLastError=true)] public static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);\n}\n'@\n$app=Get-Process -Id __LAB_PID__ -ErrorAction SilentlyContinue\nif (-not $app) { exit 1 }\n$root=[Windows.Automation.AutomationElement]::RootElement\n$own=[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,[int]$app.Id)\nfor($i=0;$i -lt 60;$i++){ \n$windows=$root.FindAll([Windows.Automation.TreeScope]::Children,$own)\nforeach ($win in $windows) {\n if ($win.Current.Name -ne '确认接收文件') {continue}\n $body=$win.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name }\n if (($body -join ' ') -notmatch '是否接收此文件' -or ($body -join ' ') -notmatch '不会覆盖已有文件') {continue}\n foreach ($el in $win.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)) {\n   if ($el.Current.Name -eq '确认接收' -and $el.Current.ClassName -eq 'CCPushButton' -and $el.Current.NativeWindowHandle) {\n      [TestDialogClick]::PostMessage([IntPtr]$el.Current.NativeWindowHandle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)\n      exit\n   }\n }\n}\nStart-Sleep -Milliseconds 500\n}\nexit 2".replace("__LAB_PID__",String(pid));
 const dialog = spawn("powershell.exe",["-NoProfile","-EncodedCommand",Buffer.from(ps,"utf16le").toString("base64")],{windowsHide:true,stdio:"inherit"});
 return once(dialog, "exit").then(([code]) => code);
}
