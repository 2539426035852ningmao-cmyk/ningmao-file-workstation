import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { confirm } from "./native-room-confirm.mjs";

const [exe, testData] = process.argv.slice(2);
assert.ok(process.platform === "win32" && exe && testData && basename(testData) === "test-data",
  "Supply the packaged Windows EXE and a transfer test kit's isolated test-data directory.");
const workspace = join(testData, "desktop");
await access(join(testData, "launch.log"));
await access(join(workspace, "room-station.bin"));
const bound = join(testData, "native-integration-receive-" + randomUUID());
const source = join(bound, "native-source.txt");
const hostBytes = Buffer.from("Windows 房主发出的合成文件");
const guestBytes = Buffer.from("网页访客发出的同名合成文件");
const original = Buffer.from("本机接收目录里的同名原件");
const guestFileName = "browser-receipt.txt";
const h = bytes => createHash("sha256").update(bytes).digest("hex");
await mkdir(bound);
await writeFile(source, hostBytes);
await writeFile(join(bound, guestFileName), original);
const reserve = createServer().listen(0, "127.0.0.1");
await once(reserve, "listening");
const cdpPort = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const app = spawn(exe, [], { windowsHide: true, stdio: "ignore", env: {
  ...process.env, NINGMAO_DATA_DIR: workspace, WEBVIEW2_USER_DATA_FOLDER: join(testData, "webview"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=" + cdpPort + " --remote-debugging-address=127.0.0.1",
}});
const site = "http://127.0.0.1:5192/rooms";
let browser;
try {
  let native, page;
  for (let i = 0; i < 80 && !page; i++) {
    assert.equal(app.exitCode, null);
    try {
      if (!native) {
        const debug = "http://127.0.0.1:" + cdpPort;
        if ((await fetch(debug + "/json/version", { signal: AbortSignal.timeout(1000) })).ok) native = await chromium.connectOverCDP(debug);
      }
      for (const tab of native?.contexts().flatMap(context => context.pages()) ?? []) {
        if (await tab.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main").catch(() => false)) page = tab;
      }
    } catch {}
    if (!page) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(page, "packaged Windows WebView2 did not load");
  const invoke = (command, args = {}) => page.evaluate(({ command, args }) => {
    if (command.startsWith("room_bulk_")) args.onProgress = "__CHANNEL__:" + window.__TAURI_INTERNALS__.transformCallback(() => {});
    return window.__TAURI_INTERNALS__.invoke(command, args);
  }, { command, args }).catch(error => { throw new Error(String(error)); });
  const stopped = await invoke("room_station_view");
  assert.equal(stopped.available, true);
  assert.equal(stopped.running, false);
  assert.ok(stopped.folder.endsWith("柠猫互传暂存"));
  await assert.rejects(fetch(site));
  const started = await invoke("room_station_start", { quotaMib: 512 });
  assert.equal(started.address, site);
  assert.equal(started.running, true);
  const room = await invoke("room_create", { station: site, name: "集成测试房主", approval: true });
  browser = await chromium.launch();
  const guest = await browser.newPage({ acceptDownloads: true });
  const timeout = { timeout: 15000 };
  await guest.goto(room.invitation);
  await guest.getByLabel("显示名称").fill("集成测试网页访客");
  await guest.getByRole("button", { name: "加入互传区" }).click();
  await guest.getByText("等待群主或管理员批准加入。").waitFor(timeout);
  const before = await invoke("room_view", { invitation: room.invitation });
  assert.equal(before.member.role, "owner");
  assert.equal(before.memberLimit, 5);
  assert.equal(before.members.filter(member => member.status === "active").length, 1);
  const pending = before.members.find(candidate => candidate.name === "集成测试网页访客");
  assert.equal(pending.status, "pending");
  await invoke("room_decide", { invitation: room.invitation, memberId: pending.id, accept: true });
  await guest.getByRole("heading", { name: "共享文件" }).waitFor(timeout);

  const db = new DatabaseSync(join(workspace, "workstation.sqlite3"));
  const shelfId = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='shelf' RETURNING next_id-1 AS id").get().id;
  const itemId = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1 AS id").get().id;
  db.prepare("INSERT INTO shelves (id,name,kind,root) VALUES (?,?,'bound',?)").run(shelfId, "合成集成收件", bound);
  db.prepare("INSERT INTO items (id,shelf_id,path,name,position) VALUES (?,1,?,'native-source.txt',0)").run(itemId, source);
  db.close();

  await invoke("room_bulk_upload", { invitation: room.invitation, shelfId: 1, itemId, uploadId: randomUUID().replace(/-/g, "") });
  async function verifyBrowserDownload() {
    const getting = guest.waitForEvent("download", timeout);
    await guest.getByRole("button", { name: "保存 native-source.txt" }).click();
    const downloaded = await getting;
    assert.equal(downloaded.suggestedFilename(), "native-source.txt");
    assert.equal(h(await readFile(await downloaded.path())), h(hostBytes));
  }
  await verifyBrowserDownload();

  await guest.getByLabel("选择文件").setInputFiles({ name: guestFileName, mimeType: "text/plain", buffer: guestBytes });
  await guest.getByRole("button", { name: "发给全区 2 人" }).click();
  await guest.getByRole("button", { name: "保存 " + guestFileName }).waitFor(timeout);
  const uploaded = (await invoke("room_view", { invitation: room.invitation })).files.find(file => file.name === guestFileName);
  assert.equal(uploaded.digest, h(guestBytes));
  const ticket = randomUUID();
  await Promise.all([
    confirm(app.pid).then(code => assert.equal(code, 0, "Windows receive confirmation")),
    invoke("room_bulk_receive", { invitation: room.invitation, fileId: uploaded.id, shelfId, ticket }),
  ]);
  const receipt = await invoke("web_receive_finish", { ticket });
  assert.equal(receipt.file_name, "browser-receipt (1).txt");
  assert.equal(h(await readFile(join(bound, receipt.file_name))), h(guestBytes));
  assert.deepEqual(await readFile(join(bound, guestFileName)), original);
  assert.deepEqual(await readFile(source), hostBytes);

  assert.equal((await invoke("room_station_stop")).running, false);
  await assert.rejects(fetch(site));
  await guest.getByRole("alert").filter({ hasText: "互传站点暂时无法连接" }).waitFor(timeout);
  assert.equal((await invoke("room_station_start", { quotaMib: 512 })).address, site);
  await guest.getByRole("alert").filter({ hasText: "互传站点暂时无法连接" }).waitFor({ ...timeout, state: "hidden" });
  assert.equal((await invoke("room_view", { invitation: room.invitation })).files.length, 2);
  // Reload the original link and use the existing visitor session to retrieve the retained file.
  await guest.reload();
  await guest.getByRole("heading", { name: "集成测试网页访客 成员" }).waitFor(timeout);
  await verifyBrowserDownload();
  const roomApi = new URL("/api/rooms/" + new URL(room.invitation).searchParams.get("code"), site).href;
  const joinFrom = (context, name, endpoint = roomApi) => context.request.post(endpoint + "/join", { data: { name } });
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const queued = await Promise.all(contexts.map(async (context, index) => {
    const response = await joinFrom(context, "合成成员 " + (index + 1));
    assert.equal(response.status(), 200);
    return (await response.json()).member;
  }));
  for (const { id } of queued.slice(0, 3)) {
    await invoke("room_decide", { invitation: room.invitation, memberId: id, accept: true });
  }
  await guest.getByText("文件群成员 5 / 5 人").waitFor(timeout);
  await assert.rejects(invoke("room_decide", { invitation: room.invitation, memberId: queued[3].id, accept: true }), /最多 5 人/);
  await invoke("room_depart", { invitation: room.invitation, memberId: pending.id });
  await guest.getByText("你已被移出这个文件群。").waitFor(timeout);
  await invoke("room_decide", { invitation: room.invitation, memberId: queued[3].id, accept: true });
  assert.equal((await invoke("room_view", { invitation: room.invitation })).members.length, 5);
  assert.equal((await joinFrom(guest.context(), "已移出的网页访客")).status(), 403);

  const other = await contexts[0].request.post(new URL("/api/rooms", site).href, { data: { name: "网页群主", approval: false } });
  assert.equal(other.status(), 201);
  const otherInvite = site + "?code=" + (await other.json()).code;
  await invoke("room_join", { invitation: otherInvite, name: "桌面访客" });
  assert.equal((await invoke("room_view", { invitation: otherInvite })).members.length, 2);
  await invoke("room_depart", { invitation: otherInvite, memberId: null });
  assert.equal((await invoke("room_view", { invitation: otherInvite })).status, "left");
  console.log(JSON.stringify({ result: "native-managed-room-and-independent-Chromium-guest-pass",
    desktopSendSHA: h(hostBytes), webSendSHA: h(guestBytes), savedAs: receipt.file_name,
    originalIntact: true, stoppedDuringTest: true, retainedInviteAndGuest: true,
    fiveMembers: true, desktopRemovedGuest: true, desktopGuestLeft: true }));
} finally {
  await browser?.close();
  if (app.exitCode === null && app.signalCode === null) { const exit = once(app, "exit"); app.kill(); await exit; }
  for (let i = 0; i < 20; i++) {
    try { await fetch(site); } catch { break; }
    if (i === 19) throw new Error("The managed listener outlived its parent process");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
