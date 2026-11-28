import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import { createRoomServer } from "../selfhost/server.mjs";
import { decodeRoomInvitation } from "./room-test-qr.mjs";
import { createTestTls } from "./room-test-tls.mjs";

const adb = (...args) => execFileSync(process.env.ADB ?? "adb", args, { encoding: "utf8", timeout: 15_000 }).trim();
const expect = playwrightExpect.configure({ timeout: 20_000 });
const serial = process.env.ANDROID_SERIAL ?? adb("devices").match(/^(emulator-\d+)\s+device\s*$/m)?.[1];
assert.match(serial ?? "", /^emulator-\d+$/, "A booted Android emulator is required.");
const device = (...args) => adb("-s", serial, ...args);
assert.equal(device("shell", "getprop", "sys.boot_completed"), "1");
assert.match(device("shell", "pm", "list", "packages", "com.android.chrome"), /package:com.android.chrome/);
const pickerPath = "/data/local/tmp/ningmao-picker.xml";
function pickerNodes() {
  try {
    const xml = device("shell", `rm -f ${pickerPath} && uiautomator dump ${pickerPath} && cat ${pickerPath}`);
    return [...xml.matchAll(/<node ([^>]+)>/g)].map(([, attributes]) => {
      function attribute(name) {
        const value = new RegExp(`(?:^| )${name}="([^"]*)"`).exec(attributes)?.[1] ?? "";
        return value.replaceAll("&amp;", "&").replaceAll("&apos;", "'").replaceAll("&quot;", '"');
      }
      return { text: attribute("text"), description: attribute("content-desc"), bounds: attribute("bounds"), package: attribute("package") };
    });
  } catch { return []; }
}

function tapNode(node) {
  const [left, top, right, bottom] = node.bounds.match(/\d+/g).map(Number);
  device("shell", "input", "tap", String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));
}

async function installTestCa(ca, name) {
  device("push", ca, "/sdcard/Download/" + name);
  assert.match(device("shell", "locksettings", "set-pin", "1234"), /Pin set to/i);
  // Android 14 exports this page directly. The top-level Security Hub can
  // display account alerts above the credential settings on a clean emulator.
  assert.match(device("shell", "am", "start", "-W", "-a", "com.android.settings.MORE_SECURITY_PRIVACY_SETTINGS",
    "-p", "com.android.settings"), /Status: ok/);
  async function follow(...labels) {
    const seen = new Set();
    await expect.poll(() => {
      const nodes = pickerNodes();
      for (const label of labels) {
        const value = label.toLowerCase();
        const node = nodes.find(n => (value === n.text.toLowerCase() || value === n.description.toLowerCase()) && n.bounds);
        if (!node || seen.has(label)) continue;
        seen.add(label);
        tapNode(node);
        console.log("Android certificate setup: " + label);
        if (label === labels.at(-1)) return label;
        return "Tapped " + label;
      }
      if (nodes.some(node => /Enter your PIN|Confirm your PIN/i.test(node.text))) {
        device("shell", "input", "text", "1234");
        device("shell", "input", "keyevent", "KEYCODE_ENTER");
      } else if (nodes.some(node => node.package === "com.android.settings")) {
        const screen = device("shell", "wm", "size").match(/(\d+)x(\d+)\s*$/);
        if (screen) {
          const [, w, h] = screen.map(Number);
          device("shell", "input", "swipe", String(w >> 1), String(Math.floor(h * .75)), String(w >> 1), String(Math.floor(h * .35)), "360");
        }
      }
      return nodes.map(node => node.text || node.description).filter(Boolean).join(" / ");
    }, { timeout: 60_000, intervals: [700] }).toBe(labels.at(-1));
  }
  await follow("Encryption & credentials");
  await follow("Install a certificate", "CA certificate");
  await follow("Install anyway", "Show roots", "Open navigation drawer", "Downloads", "Download", name);
  // The temporary PIN is for certificate enrollment. Keep the subsequent
  // sleep/wake scenario on the emulator's original swipe lock.
  assert.match(device("shell", "locksettings", "clear", "--old", "1234"), /Lock credential cleared/i);
}

async function selectDeviceFile(page, name) {
  const input = page.locator('input[type="file"]');
  await input.click();
  const used = new Set();
  await expect.poll(async () => {
    if (await input.evaluate(element => element.files?.[0]?.name) === name) return "Selected " + name;
    const nodes = pickerNodes();
    const find = value => nodes.find(node => (node.text === value || node.description === value) && node.bounds);
    const selected = find(name);
    if (selected) { tapNode(selected); return "Tapped " + name; }
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
const httpsEmulator = process.argv.includes("--https-emulator");
const nativeArg = process.argv.indexOf("--native-exe");
const nativeExe = nativeArg < 0 ? undefined : process.argv[nativeArg + 1];
const emulatorNetwork = httpsEmulator || process.argv.includes("--emulator-network");
if (nativeArg >= 0) assert.ok(nativeExe && process.platform === "win32" && !emulatorNetwork,
  "Pass a Windows candidate EXE to run the native host through ADB reverse.");
console.log(httpsEmulator ? "Android HTTPS virtual network test" : "Android HTTP test");
const tls = httpsEmulator ? await createTestTls(local, ["127.0.0.1", "room.test"]) : undefined;
const caName = "ningmao-" + tag + ".crt";
if (tls) setDefaultCACertificates([...getCACertificates("default"), await readFile(tls.ca, "utf8")]);
let station;
async function start(port = 0) {
  station = createRoomServer(local, tls, 32 * 1024 * 1024).listen(port, "127.0.0.1");
  await once(station, "listening");
  return station.address().port;
}
async function stop() {
  if (!station) return;
  await new Promise(resolve => {
    station.close(resolve);
    station.closeAllConnections();
  });
  station = undefined;
}
const stationPort = await start();
const origin = (tls ? "https" : "http") + "://127.0.0.1:" + stationPort;
const androidOrigin = httpsEmulator ? origin.replace("127.0.0.1", "room.test")
  : emulatorNetwork ? origin.replace("127.0.0.1", "10.0.2.2") : origin;
function activeTransport() {
  const output = device("shell", "dumpsys", "connectivity");
  const id = /Active default network: (\d+)/.exec(output)?.[1];
  const active = output.split("\n").find(line => line.includes("network{" + id + "}") && line.includes("Transports:"));
  return /Transports: (WIFI|CELLULAR)/.exec(active ?? "")?.[1] ?? "";
}

const port = "tcp:" + station.address().port;
const fromAndroid = "from-android-" + tag + ".bin";
const toAndroid = "to-android-" + tag + ".bin";
const receivedPath = "/sdcard/Download/" + toAndroid;
const sourcePath = "/sdcard/Download/" + fromAndroid;
let browser;
let hostBrowser;
let nativeOwner;
let forwarded;
try {
  if (tls) await installTestCa(tls.ca, caName);
  if (!emulatorNetwork) device("reverse", port, port);
  device("shell", "am", "force-stop", "com.android.chrome");
  device("shell", "am", "set-debug-app", "--persistent", "com.android.chrome");
  const secureOrigin = emulatorNetwork && !tls ? " --unsafely-treat-insecure-origin-as-secure=" + androidOrigin : "";
  const qrHost = httpsEmulator ? ' --no-proxy-server --host-resolver-rules="MAP room.test 10.0.2.2"' : "";
  device("shell", "echo '_ --disable-fre --no-first-run --no-default-browser-check" + secureOrigin + qrHost +
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
  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  if (tls) console.log("Android Chrome accepted the HTTPS certificate at the emulator gateway.");

  let owner, cookie, invitation;
  if (nativeExe) {
    const { startNativeOwner } = await import("./native-android-owner.mjs");
    nativeOwner = await startNativeOwner(nativeExe, local);
    const created = await nativeOwner.invoke("room_create", { station: origin, name: "Windows 群主", approval: true });
    invitation = created.invitation;
  } else if (tls) {
    const pin = createHash("sha256").update(new X509Certificate(tls.cert).publicKey.export({ type: "spki", format: "der" })).digest("base64");
    hostBrowser = await chromium.launch({
      proxy: { server: "http://127.0.0.1:1", bypass: "room.test" },
      args: ["--host-resolver-rules=MAP room.test 127.0.0.1", "--ignore-certificate-errors-spki-list=" + pin],
    });
    owner = await hostBrowser.newPage();
    await owner.goto(androidOrigin + "/rooms");
    await owner.getByLabel("显示名称").fill("电脑房主");
    await owner.getByLabel("入区需批准").check();
    await owner.getByRole("button", { name: "创建互传区" }).click();
    invitation = await decodeRoomInvitation(owner);
    const [session] = await owner.context().cookies(androidOrigin + "/api/rooms");
    cookie = session.name + "=" + session.value;
    console.log("The desktop browser created the room and its displayed QR decoded to the same invitation URL.");
  } else {
    const created = await fetch(origin + "/api/rooms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "站点测试客户端", approval: false }),
    });
    assert.equal(created.status, 201);
    cookie = created.headers.get("set-cookie").split(";")[0];
    invitation = androidOrigin + "/rooms?code=" + (await created.json()).code;
  }
  const room = origin + "/api/rooms/" + new URL(invitation).searchParams.get("code");
  await page.goto(invitation);
  await page.getByLabel("显示名称").fill("Android 测试客户端");
  await page.getByRole("button", { name: "加入互传区" }).click();
  if (owner || nativeOwner) {
    await expect(page.getByText("等待群主或管理员批准加入。")).toBeVisible();
    await expect(page.getByRole("heading", { name: "共享文件" })).toHaveCount(0);
    if (nativeOwner) {
      const view = await nativeOwner.invoke("room_view", { invitation });
      const guest = view.members.find(member => member.status === "pending" && member.name === "Android 测试客户端");
      assert.ok(guest, "Android must await approval under its own identity");
      await nativeOwner.invoke("room_decide", { invitation, memberId: guest.id, accept: true });
      const [session] = await context.cookies(androidOrigin + "/api/rooms");
      cookie = session.name + "=" + session.value;
    } else await owner.getByRole("button", { name: "批准", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "共享文件" })).toBeVisible();

  const androidFixture = Buffer.alloc(187, 28);
  if (nativeOwner) {
    await nativeOwner.upload(invitation, toAndroid, androidFixture);
  } else if (owner) {
    await owner.getByLabel("选择文件").setInputFiles({ name: toAndroid, mimeType: "application/octet-stream", buffer: androidFixture });
    await owner.getByRole("button", { name: "发给全区 2 人" }).click();
  } else {
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
  }

  await expect(page.getByRole("button", { name: "保存 " + toAndroid })).toBeVisible();
  if (emulatorNetwork) {
    const response = await fetch(room, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const sent = (await response.json()).files.find(file => file.name === toAndroid);
    assert.equal(sent?.digest, sha(androidFixture));
    const filePath = new URL(room).pathname + "/files/" + sent.id;
    async function checkTransport(transport) {
      await expect.poll(activeTransport, { timeout: 30_000, intervals: [1000] }).toBe(transport);
      await expect.poll(() => page.evaluate(async path => {
        try {
          const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
          if (!response.ok) return "";
          const bytes = await response.arrayBuffer();
          return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            byte => byte.toString(16).padStart(2, "0")).join("");
        } catch {
          return "";
        }
      }, filePath), { timeout: 20_000, intervals: [750] }).toBe(sha(androidFixture));
      console.log("Android emulator active transport: " + transport + ", synthetic file hash verified.");
    }
    try {
      device("shell", "svc", "wifi", "enable");
      device("shell", "svc", "data", "disable");
      await checkTransport("WIFI");
      device("shell", "svc", "data", "enable");
      device("shell", "svc", "wifi", "disable");
      await checkTransport("CELLULAR");
      device("shell", "svc", "wifi", "enable");
      device("shell", "svc", "data", "disable");
      await checkTransport("WIFI");
    } finally {
      device("shell", "svc", "wifi", "enable");
      device("shell", "svc", "data", "enable");
    }
  }
  if (!emulatorNetwork || httpsEmulator) {
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
    if (nativeOwner) {
      assert.equal(sha(await nativeOwner.receive(invitation, uploaded)), sha(fixture));
      console.log("Windows native receipt preserved the existing same-name file.");
    } else if (owner) {
      const downloading = owner.waitForEvent("download");
      await owner.getByRole("button", { name: "保存 " + fromAndroid }).click();
      const saved = await downloading;
      assert.equal(sha(await readFile(await saved.path())), sha(fixture));
    }
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

    if (httpsEmulator) {
      try {
        device("shell", "svc", "data", "disable");
        device("shell", "svc", "wifi", "disable");
        await expect(page.getByRole("alert")).toContainText("互传站点暂时无法连接", { timeout: 40_000 });
        await expect.poll(sourceCount, { timeout: 40_000 }).toBe(0);
        device("shell", "svc", "wifi", "enable");
        await expect.poll(activeTransport, { timeout: 30_000, intervals: [1000] }).toBe("WIFI");
        await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 40_000 });
        await expect(page.getByRole("heading", { name: /Android 测试客户端/ })).toBeVisible();
      } finally {
        device("shell", "svc", "wifi", "enable");
        device("shell", "svc", "data", "enable");
      }
      console.log("Android radio outage: source went offline, room returned under the existing HTTPS invite.");

      await stop();
      await expect(page.getByRole("alert")).toContainText("互传站点暂时无法连接", { timeout: 40_000 });
      await start(stationPort);
      await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 40_000 });
      await expect(page.getByRole("button", { name: "保存 " + toAndroid })).toBeVisible();
      console.log("Host stopped and restarted: original HTTPS invite and staged file recovered.");
    }
  }
} finally {
  await browser?.close();
  await hostBrowser?.close();
  await nativeOwner?.stop();
  if (forwarded) device("forward", "--remove", forwarded);
  if (!emulatorNetwork) device("reverse", "--remove", port);
  device("shell", "am", "clear-debug-app");
  device("shell", "rm", "-f", "/data/local/tmp/chrome-command-line", pickerPath, sourcePath, receivedPath, "/sdcard/Download/" + caName);
  await stop();
  await rm(local, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
}
