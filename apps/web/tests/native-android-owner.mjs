import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { confirm } from "./native-room-confirm.mjs";

export async function startNativeOwner(exe, root) {
  assert.equal(process.platform, "win32");
  const workspace = join(root, "windows");
  const target = join(root, "windows-receive");
  await mkdir(workspace);
  await mkdir(target);
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const debug = "http://127.0.0.1:" + reserve.address().port;
  const port = reserve.address().port;
  await new Promise(done => reserve.close(done));
  const app = spawn(resolve(exe), [], { windowsHide: true, stdio: "ignore", env: {
    ...process.env, NINGMAO_DATA_DIR: workspace, WEBVIEW2_USER_DATA_FOLDER: join(workspace, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=" + port + " --remote-debugging-address=127.0.0.1",
  }});
  await once(app, "spawn");
  let browser;
  async function stop() {
    await browser?.close();
    if (app.exitCode === null && app.signalCode === null) {
      const exit = once(app, "exit");
      app.kill();
      await exit;
    }
  }
  try {
    let page;
    for (let attempt = 0; attempt < 100 && !page; attempt++) {
      assert.equal(app.exitCode, null);
      try {
        if (!browser && (await fetch(debug + "/json/version", { signal: AbortSignal.timeout(500) })).ok) {
          browser = await chromium.connectOverCDP(debug);
        }
        for (const tab of browser?.contexts().flatMap(context => context.pages()) ?? []) {
          if (await tab.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main").catch(() => false)) page = tab;
        }
      } catch {}
      if (!page) await wait(250);
    }
    assert.ok(page, "Native Windows WebView did not load");
    const invoke = (command, args = {}) => page.evaluate(({ command, args }) => {
      if (command.startsWith("room_bulk_")) args.onProgress = "__CHANNEL__:" + window.__TAURI_INTERNALS__.transformCallback(() => {});
      return window.__TAURI_INTERNALS__.invoke(command, args);
    }, { command, args }).catch(error => { throw new Error(String(error)); });

    return {
      stop,
      invoke,
      async upload(invitation, name, bytes) {
        const source = join(root, name);
        await writeFile(source, bytes);
        const db = new DatabaseSync(join(workspace, "workstation.sqlite3"));
        let itemId;
        try {
          itemId = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1 AS id").get().id;
          db.prepare("INSERT INTO items (id,shelf_id,path,name,position) VALUES (?,1,?,?,0)").run(itemId, source, name);
        } finally { db.close(); }
        await invoke("room_bulk_upload", { invitation, shelfId: 1, itemId, uploadId: randomUUID().replace(/-/g, "") });
        assert.deepEqual(await readFile(source), bytes);
      },
      async receive(invitation, file) {
        const previous = Buffer.from("合成同名原件");
        const original = join(target, file.name);
        await writeFile(original, previous, { flag: "wx" });
        const db = new DatabaseSync(join(workspace, "workstation.sqlite3"));
        let shelfId;
        try {
          shelfId = db.prepare("UPDATE record_ids SET next_id=next_id+1 WHERE entity='shelf' RETURNING next_id-1 AS id").get().id;
          db.prepare("INSERT INTO shelves (id,name,kind,root) VALUES (?,?,'bound',?)").run(shelfId, "手机合成收件", target);
        } finally { db.close(); }
        const ticket = randomUUID();
        await Promise.all([
          confirm(app.pid).then(code => assert.equal(code, 0)),
          invoke("room_bulk_receive", { invitation, fileId: file.id, shelfId, ticket }),
        ]);
        const receipt = await invoke("web_receive_finish", { ticket });
        assert.notEqual(receipt.file_name, file.name);
        assert.deepEqual(await readFile(original), previous);
        return readFile(join(target, receipt.file_name));
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
