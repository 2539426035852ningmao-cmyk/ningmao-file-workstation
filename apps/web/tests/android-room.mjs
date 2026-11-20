import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import { createRoomServer } from "../selfhost/server.mjs";

const adb = (...args) => execFileSync(process.env.ADB ?? "adb", args, { encoding: "utf8", timeout: 15_000 }).trim();
const serial = process.env.ANDROID_SERIAL ?? adb("devices").match(/^(emulator-\d+)\s+device\s*$/m)?.[1];
assert.match(serial ?? "", /^emulator-\d+$/, "A booted Android emulator is required.");
const device = (...args) => adb("-s", serial, ...args);
assert.equal(device("shell", "getprop", "sys.boot_completed"), "1");
assert.match(device("shell", "pm", "list", "packages", "com.android.chrome"), /package:com.android.chrome/);
function pickerNodes() {
  try {
    device("shell", "uiautomator", "dump", "/data/local/tmp/ningmao-picker.xml");
    const xml = device("shell", "cat", "/data/local/tmp/ningmao-picker.xml");
    return [...xml.matchAll(/<node ([^>]+)>/g)].map(([, attributes]) => {
      function attribute(name) { return new RegExp(`(?:^| )${name}="([^"]*)"`).exec(attributes)?.[1] ?? ""; }
      return { text: attribute("text"), description: attribute("content-desc"), bounds: attribute("bounds") };
    });
  } catch { return []; }
}

function tapNode(node) {
  const [left, top, right, bottom] = node.bounds.match(/\d+/g).map(Number);
  device("shell", "input", "tap", String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));
}

async function selectDeviceFile(page, name) {
  await page.locator('input[type="file"]').click();
  const used = new Set();
  await expect.poll(() => {
    const nodes = pickerNodes();
    const find = value => nodes.find(node => (node.text === value || node.description === value) && node.bounds);
    const selected = find(name);
    if (selected) { tapNode(selected); return "Selected " + name; }
    for (const label of ["Don’t allow", "Don't allow", "Browse", "Files", "Just once", "Show roots", "Open navigation drawer", "Downloads", "Download", "Internal shared storage", "Pixel 6"]) {
      const node = find(label);
      if (!node || used.has(label)) continue;
      used.add(label);
      tapNode(node);
      break;
    }
    return nodes.map(node => node.text || node.description).filter(Boolean).join(" / ");
  }, { timeout: 75_000, intervals: [700] }).toBe("Selected " + name);
  await expect(page.getByText(name, { exact: false })).toBeVisible();
}

const sha = data => createHash("sha256").update(data).digest("hex");
const tag = randomBytes(6).toString("hex");
const local = await mkdtemp(join(tmpdir(), "ningmao-android-room-"));
const station = createRoomServer(local, undefined, 32 * 1024 * 1024).listen(0, "127.0.0.1");
await once(station, "listening");
const emulatorNetwork = process.argv.includes("--emulator-network");
const origin = "http://127.0.0.1:" + station.address().port;
const androidOrigin = emulatorNetwork ? origin.replace("127.0.0.1", "10.0.2.2") : origin;
const port = "tcp:" + station.address().port;
const fromAndroid = "from-android-" + tag + ".bin";
const toAndroid = "to-android-" + tag + ".bin";
const receivedPath = "/sdcard/Download/" + toAndroid;
const sourcePath = "/sdcard/Download/" + fromAndroid;
let browser;
let forwarded;
try {
  if (!emulatorNetwork) device("reverse", port, port);
  device("shell", "am", "force-stop", "com.android.chrome");
  device("shell", "am", "set-debug-app", "--persistent", "com.android.chrome");
  const secureOrigin = emulatorNetwork ? " --unsafely-treat-insecure-origin-as-secure=" + androidOrigin : "";
  device("shell", "echo '_ --disable-fre --no-first-run --no-default-browser-check" + secureOrigin +
    "' > /data/local/tmp/chrome-command-line");
  device("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", androidOrigin + "/rooms", "com.android.chrome");
  forwarded = "tcp:" + device("forward", "tcp:0", "localabstract:chrome_devtools_remote");
  await expect.poll(async () => {
    try {
      return (await fetch("http://127.0.0.1:" + forwarded.slice(4) + "/json/version", { signal: AbortSignal.timeout(3000) })).status;
    } catch { return 0; }
  }, { timeout: 60_000, intervals: [1000] }).toBe(200);
  browser = await chromium.connectOverCDP("http://127.0.0.1:" + forwarded.slice(4), { noDefaults: true, timeout: 30_000 });
  const [context] = browser.contexts();
  const page = context.pages().find(tab => tab.url().startsWith(androidOrigin + "/")) ?? await context.newPage();
  await page.bringToFront();
  await page.goto(androidOrigin + "/rooms");
  assert.match(await page.evaluate(() => navigator.userAgent), /Android/);

  const created = await fetch(origin + "/api/rooms", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "站点测试客户端" }),
  });
  assert.equal(created.status, 201);
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const { code } = await created.json();
  const room = origin + "/api/rooms/" + code;
  await page.goto(androidOrigin + "/rooms?code=" + code);
  await page.getByLabel("显示名称").fill("Android 测试客户端");
  await page.getByRole("button", { name: "加入互传区" }).click();
  await expect(page.getByRole("heading", { name: "共享文件" })).toBeVisible();

  const androidFixture = Buffer.alloc(187, 28);
  const posted = await fetch(room + "/bulk", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: toAndroid, size: androidFixture.length, digest: sha(androidFixture), request: randomBytes(16).toString("hex") }),
  });
  assert.equal(posted.status, 200);
  const { id } = await posted.json();
  const upload = room + "/bulk/" + id;
  assert.equal((await fetch(upload, {
    method: "POST", headers: { Cookie: cookie, "X-Offset": "0", "X-SHA256": sha(androidFixture) }, body: androidFixture,
  })).status, 200);
  assert.equal((await fetch(upload + "/publish", { method: "POST", headers: { Cookie: cookie } })).status, 200);

  await expect(page.getByRole("button", { name: "保存 " + toAndroid })).toBeVisible();
  if (emulatorNetwork) {
    function activeTransport() {
      const output = device("shell", "dumpsys", "connectivity");
      const id = /Active default network: (\d+)/.exec(output)?.[1];
      const active = output.split("\n").find(line => line.includes("network{" + id + "}") && line.includes("Transports:"));
      return /Transports: (WIFI|CELLULAR)/.exec(active ?? "")?.[1] ?? "";
    }
    async function checkTransport(transport) {
      await expect.poll(activeTransport, { timeout: 30_000, intervals: [1000] }).toBe(transport);
      const hash = await page.evaluate(async path => {
        const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("站点不可达");
        const bytes = await response.arrayBuffer();
        return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          byte => byte.toString(16).padStart(2, "0")).join("");
      }, "/api/rooms/" + code + "/files/" + id);
      assert.equal(hash, sha(androidFixture));
      console.log("Android emulator active transport: " + transport + ", synthetic file hash verified.");
    }
    device("shell", "svc", "wifi", "enable");
    await checkTransport("WIFI");
    try {
      device("shell", "svc", "data", "enable");
      device("shell", "svc", "wifi", "disable");
      await checkTransport("CELLULAR");
    } finally {
      device("shell", "svc", "wifi", "enable");
    }
    await checkTransport("WIFI");
  } else {
    const fixture = Buffer.alloc(4 * 1024 * 1024 + 77, 61);
    const hostPath = join(local, fromAndroid);
    await writeFile(hostPath, fixture);
    device("push", hostPath, sourcePath);
    assert.equal(device("shell", "sha256sum", sourcePath).split(/\s+/)[0], sha(fixture));
    await selectDeviceFile(page, fromAndroid);
    await page.getByRole("button", { name: "发给全区 2 人" }).click();
    await expect(page.getByRole("status")).toContainText("文件校验通过", { timeout: 60_000 });
    const listing = await (await fetch(room, { headers: { Cookie: cookie } })).json();
    const uploaded = listing.files.find(file => file.name === fromAndroid);
    assert.equal(uploaded?.digest, sha(fixture));
    const copied = await fetch(room + "/files/" + uploaded.id, { headers: { Cookie: cookie } });
    assert.equal(sha(Buffer.from(await copied.arrayBuffer())), sha(fixture));
    console.log("Android native picker upload verified:", sha(fixture));

    const save = page.getByRole("button", { name: "保存 " + toAndroid });
    await save.click();
    await expect(page.getByRole("status")).toHaveText("文件校验通过，请点击保存。");
    await save.click();
    await expect.poll(() => {
      const digest = device("shell", "if [ -f " + receivedPath + " ]; then sha256sum " + receivedPath + "; fi").split(/\s+/)[0];
      if (digest) return digest;
      const nodes = pickerNodes();
      if (nodes.some(node => /Download file|Do you want to download|Download again/.test(node.text))) {
        const confirm = nodes.find(node => node.text === "Download" && node.bounds);
        if (confirm) tapNode(confirm);
      }
      return "";
    }, { timeout: 45_000, intervals: [1000] }).toBe(sha(androidFixture));
    console.log(JSON.stringify({ androidVersion: device("shell", "getprop", "ro.build.version.release"), fromAndroid: sha(fixture), toAndroid: sha(androidFixture) }));

    const sourceCount = async () => {
      const sources = await fetch(room + "/sources/" + uploaded.id + "?offset=0", { headers: { Cookie: cookie } });
      assert.equal(sources.status, 200);
      return (await sources.json()).sources.length;
    };
    await page.getByRole("button", { name: "开始供件 " + fromAndroid }).click();
    await expect.poll(sourceCount).toBe(1);
    device("shell", "input", "keyevent", "KEYCODE_SLEEP");
    await expect.poll(() => device("shell", "dumpsys", "power").includes("mWakefulness=Asleep")).toBe(true);
    await expect.poll(sourceCount, { timeout: 30_000, intervals: [500] }).toBe(0);
    const fallback = await fetch(room + "/files/" + uploaded.id, { headers: { Cookie: cookie } });
    assert.equal(fallback.status, 200);
    assert.equal(sha(Buffer.from(await fallback.arrayBuffer())), sha(fixture));
    console.log("Sleep: Android left the active source list; the station provided the identical file.");
    device("shell", "input", "keyevent", "KEYCODE_WAKEUP");
    device("shell", "wm", "dismiss-keyguard");
    await expect.poll(() => page.evaluate(() => document.visibilityState), { timeout: 20_000 }).toBe("visible");
    await expect.poll(sourceCount).toBe(0);
    await page.getByRole("button", { name: "开始供件 " + fromAndroid }).click();
    await expect.poll(sourceCount).toBe(1);
    console.log("Wake: Android offered the verified file again after explicit activation.");

  }
} finally {
  await browser?.close();
  if (forwarded) device("forward", "--remove", forwarded);
  if (!emulatorNetwork) device("reverse", "--remove", port);
  device("shell", "am", "clear-debug-app");
  device("shell", "rm", "-f", "/data/local/tmp/chrome-command-line", "/data/local/tmp/ningmao-picker.xml", sourcePath, receivedPath);
  station.closeAllConnections();
  await new Promise(done => station.close(done));
  await rm(local, { recursive: true, force: true });
}
