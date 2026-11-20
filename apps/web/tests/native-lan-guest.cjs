const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { hostname, tmpdir } = require("node:os");
const { createHash } = require("node:crypto");
const { mkdir, readFile, readdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const assert = require("node:assert/strict");
const [role, executable, expectedHash, cache] = process.argv.slice(2);
assert.ok(role === "a" || role === "b", "Supply the isolated Windows guest role a or b");
assert.equal(hostname().toLowerCase(), "ningmao-lab-" + role);
assert.match(expectedHash || "", /^[a-f0-9]{64}$/);
const data = require("node:fs").mkdtempSync(join(tmpdir(), "ningmao-lan-" + role + "-"));
const bound = join(data, "bound");
const sourceDir = join(data, "source");
const exe = executable;
const ip = "192.168.253." + (role === "a" ? "10" : "11");
const peerIp = "192.168.253." + (role === "a" ? "11" : "10");
const peerRole = role === "a" ? "b" : "a";
const addr = ip + ":53317";
const peerAddr = peerIp + ":53317";
const bytes = role => Buffer.alloc(4194577, role === "a" ? 41 : 71);
const hash = value => createHash("sha256").update(value).digest("hex");
const wait = async (check, timeout, label) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const result = await check();
    if (result) return result;
    await new Promise(done => setTimeout(done, 700));
  }
  throw new Error("Timed out: " + label);
};
async function run() {
  await mkdir(bound, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  const source = join(sourceDir, "fixture.bin");
  const original = join(bound, "fixture.bin");
  const payload = bytes(role);
  await writeFile(source, payload);
  await writeFile(original, "original synthetic file");
  const exeHash = hash(await readFile(exe));
  assert.equal(exeHash, expectedHash);
  console.log("Executable SHA-256", exeHash);
  const app = spawn(exe, [], { windowsHide: true, stdio:"ignore", env: {
    ...process.env, NINGMAO_DATA_DIR:data, WEBVIEW2_USER_DATA_FOLDER:cache || join(data, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:"--remote-debugging-port=52986 --remote-debugging-address=127.0.0.1",
  } });
  try {
    const debug = "http://127.0.0.1:52986";
    const browser = await wait(async () => {
      assert.equal(app.exitCode, null);
      try {
        if ((await fetch(debug + "/json/version", { signal: AbortSignal.timeout(7000) })).ok) {
          return await chromium.connectOverCDP(debug, { timeout: 15000 });
        }
      } catch {}
    }, 480000, "WebView");
    const page = await wait(async () => {
      for (const p of browser.contexts().flatMap(c => c.pages())) {
        if (await p.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main").catch(() => false)) return p;
      }
    }, 60000, "main window");
    const call = (command, args = {}) => page.evaluate(({ command, args }) =>
      window.__TAURI_INTERNALS__.invoke(command, args), { command, args }).catch(error => { throw new Error(String(error)); });
    assert.equal((await call("transfer_view")).receiving, false);
    const db = new DatabaseSync(join(data, "workstation.sqlite3"));
    const shelf = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='shelf' RETURNING next_id-1 AS id").get().id;
    const item = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1 AS id").get().id;
    db.prepare("INSERT INTO shelves (id,name,kind,root) VALUES (?,?,'bound',?)").run(shelf, "Synthetic target", bound);
    db.prepare("INSERT INTO items (id,shelf_id,path,name,position) VALUES (?,1,?,?,0)").run(item, source, "fixture.bin");
    db.close();
    await call("transfer_receive", { shelfId:shelf, bindAddress:addr });
    console.log("Started receiver at " + addr);
    const peer = await wait(async () => (await call("transfer_devices")).find(p => p.address === peerAddr), 540000, "UDP multicast peer");
    console.log("Discovered " + peer.address);
    assert.match(peer.fingerprint, /^[a-f0-9]{64}$/);
    assert.notEqual(peer.fingerprint, (await call("transfer_view")).fingerprint);
    const wrong = "f".repeat(64);
    await assert.rejects(call("transfer_pair", { name:peer.name, address:peerAddr, fingerprint:wrong }));
    assert.equal((await call("transfer_peers")).length, 0);
    await call("transfer_pair", peer);
    assert.equal((await call("transfer_peers"))[0].fingerprint, peer.fingerprint);
    console.log("Verified matching device certificate and rejected incorrect fingerprint");
    const send = () => call("transfer_send", { shelfId:1, ids:[item], address:peerAddr, fingerprint:peer.fingerprint });
    const receive = async () => {
      const pending = () => call("transfer_view").then(v => v.pending);
      const first = await wait(pending, 90000, "first receive confirmation");
      assert.deepEqual(await readdir(bound), ["fixture.bin"]);
      await call("transfer_decide", { id:first.id, accept:false });
      console.log("Rejected first inbound request");
      const again = await wait(async () => { const p = await pending(); return p && p.id !== first.id && p; }, 90000, "retry receive confirmation");
      assert.deepEqual(await readdir(bound), ["fixture.bin"]);
      await call("transfer_decide", { id:again.id, accept:true });
      const received = await wait(async () => {
        const files = await readdir(bound);
        return files.find(name => name !== "fixture.bin" && name.startsWith("fixture ("));
      }, 90000, "committed file");
      assert.equal(received, "fixture (1).bin");
      const saved = await readFile(join(bound, received));
      assert.equal(hash(saved), hash(bytes(peerRole)));
      assert.equal(await readFile(original, "utf8"), "original synthetic file");
      console.log("Verified inbound file and retained the original");
      return hash(saved);
    };
    const sendAndRetry = async () => {
      const rejected = await send();
      assert.match(rejected.message, /对方未接受文件/);
      const received = await send();
      console.log("Outbound receipt", received.status, received.message);
      assert.equal(received.status, "completed");
      assert.equal(hash(await readFile(source)), hash(payload));
    };
    if (role === "a") await sendAndRetry();
    const savedHash = await receive();
    if (role === "b") await sendAndRetry();
    await call("transfer_stop_receive");
    assert.equal((await call("transfer_view")).receiving, false);
    console.log(JSON.stringify({ role, addr, savedHash, size:payload.length, acceptedAfterReject:true, sourceUnchanged:true, stopped:true }));
  } finally {
    app.kill();
  }
}
const deadline = setTimeout(() => process.exit(2), 990000);
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(deadline));
