import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { chromium } from "playwright";
import { createRoomServer } from "../selfhost/server.mjs";

assert.equal(process.platform, "win32");
const source = process.argv[2];
assert.ok(source, "Supply a freshly built Windows EXE.");
const root = await mkdtemp(join(tmpdir(), "ningmao-native-social-"));
const exe = join(root, `NingmaoSocialProof-${Date.now()}.exe`);
await copyFile(source, exe);
const station = createRoomServer(join(root, "station")).listen(0, "127.0.0.1");
await once(station, "listening");
const origin = `http://127.0.0.1:${station.address().port}`;
const passphrase = "synthetic native integration passphrase";
const browser = await chromium.launch();
const web = await browser.newPage();
const sessions = [];
let child;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const invoke = (page, command, args = {}) => page.evaluate(({ command, args }) =>
  window.__TAURI_INTERNALS__.invoke(command, args), { command, args });

try {
  const account = username => web.request.post(origin + "/api/account/register", { data: { username, password: passphrase } });
  assert.equal((await account("Native_A")).status(), 201);
  const pageAccount = (await (await account("Web_B")).json()).account;
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const debug = `http://127.0.0.1:${port}`;
  child = spawn(exe, { windowsHide: true, stdio: "ignore", env: {
    ...process.env, NINGMAO_DATA_DIR: join(root, "workspace"), WEBVIEW2_USER_DATA_FOLDER: join(root, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
  } });
  async function nativePage(username) {
    const deadline = Date.now() + 24_000;
    let session;
    while (Date.now() < deadline) {
      try {
        if (!session?.isConnected() && (await fetch(debug + "/json/version", { signal: AbortSignal.timeout(600) })).ok) {
          session = await chromium.connectOverCDP(debug, { timeout: 2000 });
          sessions.push(session);
        }
        for (const page of session?.contexts().flatMap(context => context.pages()) ?? []) {
          if (!await page.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main")) continue;
          if ((await invoke(page, "station_account_view")).username === username) return page;
        }
      } catch {}
      await pause(300);
    }
    throw new Error("Native account workspace did not appear.");
  }
  let native = await nativePage(null);
  await invoke(native, "station_account_login", {
    station: origin, username: "Native_A", password: passphrase, associate: false,
  }).catch(() => {});
  native = await nativePage("Native_A");
  const social = (action, input, room) => invoke(native, "station_social_request", { action, input, room });
  await social("request", { username: "Web_B" });
  const incoming = await web.request.get(origin + "/api/social");
  const friend = (await incoming.json()).friends.find(item => item.username === "Native_A");
  assert.equal((await web.request.post(origin + "/api/social/accept", { data: { id: friend.id } })).status(), 200);
  const { code } = await social("rooms", { name: "Native group", members: [pageAccount.id] });
  const invitation = origin + "/rooms?code=" + code;
  assert.equal((await invoke(native, "room_view", { invitation })).title, "Native group");
  await social("messages", { room: code, text: "Message from Windows" });
  await web.goto(invitation);
  await web.getByText("Message from Windows", { exact: true }).waitFor({ timeout: 10_000 });
  await web.getByRole("textbox", { name: "消息" }).fill("Message from the web");
  await web.getByRole("button", { name: "发送消息" }).click();
  await web.getByText("Message from the web", { exact: true }).waitFor({ timeout: 10_000 });
  assert.equal((await social("messages", undefined, code)).messages.at(-1).body, "Message from the web");
  const bytes = Buffer.from("Synthetic fixed-room receipt");
  const uploaded = await web.request.post(`${origin}/api/rooms/${code}/files`, { data: bytes, headers: {
    "X-File-Name": "receipt.txt", "X-SHA256": createHash("sha256").update(bytes).digest("hex"),
  } });
  assert.equal(uploaded.status(), 201);
  const fileId = (await uploaded.json()).id;
  const raw = await native.evaluate(({ invitation, fileId }) =>
    window.__TAURI_INTERNALS__.invoke("room_download", { invitation, fileId }).then(value => Array.from(new Uint8Array(value))), { invitation, fileId });
  assert.deepEqual(Buffer.from(raw), bytes);
  await invoke(native, "quit").catch(() => {});
  console.log(JSON.stringify({ windowsLogin: true, friendConfirmation: true, groupTextBothWays: true, nativeFileBytes: bytes.length }));
} finally {
  await browser.close();
  station.closeAllConnections();
  await new Promise(resolve => station.close(resolve));
  if (child?.exitCode === null) child.kill();
  try { execFileSync("taskkill", ["/IM", basename(exe), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {}
  for (const session of sessions) await session.close().catch(() => {});
}
