const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { hostname, tmpdir } = require("node:os");
const { createHash } = require("node:crypto");
const { mkdir, readFile, readdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const assert = require("node:assert/strict");
const [role, executable, expectedHash, cache, scenario] = process.argv.slice(2);
assert.ok(role === "a" || role === "b", "Supply the isolated Windows guest role a or b");
assert.equal(hostname().toLowerCase(), "ningmao-lab-" + role);
assert.match(expectedHash || "", /^[a-f0-9]{64}$/);
assert.ok(scenario === undefined || scenario === "faults" || scenario === "parallel");
const faults = scenario === "faults";
const parallel = scenario === "parallel";
const data = require("node:fs").mkdtempSync(join(tmpdir(), "ningmao-lan-" + role + "-"));
const bound = join(data, "bound");
const sourceDir = join(data, "source");
const exe = executable;
const ip = "192.168.253." + (role === "a" ? "10" : "11");
const peerIp = "192.168.253." + (role === "a" ? "11" : "10");
const peerRole = role === "a" ? "b" : "a";
const addr = ip + ":53317";
const peerAddr = peerIp + ":53317";
const fixtureMiB = faults ? 16 : parallel ? 8 : 4;
const size = fixtureMiB * 1024 * 1024 + 273;
const bytes = role => Buffer.alloc(size, role === "a" ? 41 : 71);
const hash = value => createHash("sha256").update(value).digest("hex");
const wait = async (check, timeout, label, interval = 700) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const result = await check();
    if (result) return result;
    await new Promise(done => setTimeout(done, interval));
  }
  throw new Error("Timed out: " + label);
};

async function exerciseFaults({call, shelf, items, peer}) {
  const db = new DatabaseSync(join(data, "workstation.sqlite3"), {readOnly:true});
  const job = db.prepare("SELECT id, status, message FROM jobs WHERE shelf_id = ? ORDER BY id DESC LIMIT 1");
  const send = () => call("transfer_send", {shelfId:1, ids:items, address:peerAddr, fingerprint:peer.fingerprint});
  const accept = async () => {
    const pending = await wait(() => call("transfer_view").then(v => v.pending), 150000, "new acceptance");
    assert.equal(pending.files.length, 2);
    await call("transfer_decide", {id:pending.id, accept:true});
  };
  try {
    if (role === "a") {
      const disconnected = await send();
      console.log("DISCONNECTED", disconnected.status, disconnected.files);
      assert.equal(disconnected.status, "interrupted");
      assert.deepEqual(disconnected.files.map(file => file.status), ["unconfirmed", "not_sent"]);
      assert.ok(disconnected.files[0].bytes < size);
      await wait(() => call("transfer_pair", peer).then(() => true, () => false), 150000, "restored link and pinned peer");

      const previous = job.get(1).id;
      const cancelling = send();
      const progress = await wait(() => {
        const row = job.get(1);
        const match = row?.message.match(/ (\d+)\/(\d+) B$/);
        if (row?.id !== previous && row?.status === "copying" && match && Number(match[1]) > 0 && Number(match[1]) < size) {
          return Number(match[1]);
        }
      }, 90000, "partial sender progress", 150);
      await call("transfer_cancel_send");
      const cancelled = await cancelling;
      console.log("CANCELLED_AT", progress, cancelled.status, cancelled.files);
      assert.equal(cancelled.status, "cancelled");
      assert.deepEqual(cancelled.files.map(file => file.status), ["cancelled", "cancelled"]);

      const receipt = await send();
      assert.equal(receipt.status, "completed");
      console.log("FINAL_RECEIPT", receipt.status, receipt.files);
      assert.equal(hash(await readFile(join(sourceDir, "fixture.bin"))), hash(bytes("a")));
      assert.equal(await readFile(join(sourceDir, "later.txt"), "utf8"), "second synthetic file");
    } else {
      for (const status of ["failed", "cancelled", "completed"]) {
        const previous = job.get(shelf)?.id;
        await accept();
        await wait(() => {
          const row = job.get(shelf);
          return row?.id !== previous && row?.status === status;
        }, 120000, "receiver task " + status, 200);
        const names = (await readdir(bound)).sort();
        assert.deepEqual(names, status === "completed" ? ["fixture (1).bin", "fixture.bin", "later.txt"] : ["fixture.bin"]);
        assert.equal(await readFile(join(bound, "fixture.bin"), "utf8"), "original synthetic file");
        console.log("RECEIVER", status, names.join(", "));
      }
      const savedHash = hash(await readFile(join(bound, "fixture (1).bin")));
      assert.equal(savedHash, hash(bytes("a")));
      assert.equal(await readFile(join(bound, "later.txt"), "utf8"), "second synthetic file");
      console.log("RECEIVED_SHA256", savedHash);
    }
  } finally {
    db.close();
  }
}

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
    const nextItem = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1 AS id");
    const item = nextItem.get().id;
    db.prepare("INSERT INTO shelves (id,name,kind,root) VALUES (?,?,'bound',?)").run(shelf, "Synthetic target", bound);
    const insertItem = db.prepare("INSERT INTO items (id,shelf_id,path,name,position) VALUES (?,1,?,?,?)");
    insertItem.run(item, source, "fixture.bin", 0);
    const items = [item];
    if (faults && role === "a") {
      const later = join(sourceDir, "later.txt");
      await writeFile(later, "second synthetic file");
      items.push(nextItem.get().id);
      insertItem.run(items[1], later, "later.txt", 1);
    }
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
    if (faults) {
      await exerciseFaults({call, shelf, items, peer});
      await call("transfer_stop_receive");
      assert.equal((await call("transfer_view")).receiving, false);
      console.log("FAULT_SCENARIO_PASSED", role);
      return;
    }
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
    let savedHash;
    if (parallel) {
      [savedHash] = await Promise.all([receive(), sendAndRetry()]);
    } else {
      if (role === "a") await sendAndRetry();
      savedHash = await receive();
      if (role === "b") await sendAndRetry();
    }
    await call("transfer_stop_receive");
    assert.equal((await call("transfer_view")).receiving, false);
    console.log(JSON.stringify({ role, addr, savedHash, size, parallel, acceptedAfterReject:true, sourceUnchanged:true, stopped:true }));
  } finally {
    app.kill();
  }
}
const deadline = setTimeout(() => process.exit(2), 990000);
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(deadline));
