import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createRoomServer } from "../selfhost/server.mjs";

test("self-hosted accounts stay separate, keep stable IDs, and revoke previous sessions after password change", async t => {
  const workspace = await mkdtemp(join(tmpdir(), "ningmao-account-"));
  let station, origin, stopped;
  async function start() {
    station = createRoomServer(workspace).listen(0, "127.0.0.1");
    await once(station, "listening");
    stopped = once(station, "close");
    origin = `http://127.0.0.1:${station.address().port}`;
  }
  async function stop() {
    station.close();
    await stopped;
  }
  await start();
  t.after(async () => { await stop(); await rm(workspace, { recursive: true, force: true }); });
  function browser() {
    let cookie = "";
    return async (path = "", data, headers) => {
      const result = await fetch(origin + "/api/account" + path, {
        method: data ? "POST" : "GET",
        headers: data ? { Cookie: cookie, "Content-Type": "application/json", ...headers } : { Cookie: cookie, ...headers },
        body: data ? JSON.stringify(data) : undefined,
      });
      cookie = result.headers.get("set-cookie")?.split(";")[0] ?? cookie;
      return result;
    };
  }
  const [alice, oldSession, bob, visitor] = [browser(), browser(), browser(), browser()];
  const password = "synthetic first passphrase 123";
  const newPassword = "synthetic second passphrase 456";
  const signup = await alice("/register", { username: "合成 Alice", password });
  assert.equal(signup.status, 400);
  const created = await alice("/register", { username: "Alice_测试", password });
  assert.equal(created.status, 201);
  assert.match(created.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const first = (await created.json()).account;
  assert.deepEqual(Object.keys(first).sort(), ["id", "username"]);
  assert.deepEqual((await (await visitor()).json()).account, null);
  assert.equal((await visitor("/register", { username: "ＡＬＩＣＥ_测试", password })).status, 409);
  assert.equal((await bob("/register", { username: "Bob", password })).status, 201);
  const second = (await (await bob()).json()).account;
  assert.notEqual(first.id, second.id);
  assert.equal((await oldSession("/login", { username: "alice_测试", password })).status, 200);
  assert.equal((await alice("/username", { username: "测试新名", password: "wrong" })).status, 403);
  assert.equal((await alice("/username", { username: "Bob", password })).status, 409);
  assert.deepEqual((await (await alice("/username", { username: "测试新名", password })).json()).account, { id: first.id, username: "测试新名" });
  assert.equal((await visitor("/login", { username: "Alice_测试", password })).status, 401);
  assert.equal((await alice("/password", { password, newPassword }, { Origin: "https://unrelated.invalid" })).status, 403);
  const updated = await alice("/password", { password, newPassword });
  assert.equal(updated.status, 200);
  assert.equal((await (await alice()).json()).account.id, first.id);
  assert.deepEqual((await (await oldSession()).json()).account, null);
  assert.equal((await (await bob()).json()).account.id, second.id);
  assert.equal((await oldSession("/login", { username: "测试新名", password })).status, 401);
  assert.equal((await oldSession("/login", { username: "测试新名", password: newPassword })).status, 200);
  assert.equal((await alice("/logout", {})).status, 200);
  assert.deepEqual((await (await alice()).json()).account, null);
  await stop();
  const db = new DatabaseSync(join(workspace, "rooms.sqlite"), { readOnly: true });
  try {
    const accounts = db.prepare("SELECT salt, password_hash FROM accounts").all();
    assert.equal(new Set(accounts.map(account => account.salt)).size, 2);
    for (const account of accounts) assert.match(account.password_hash, /^[0-9a-f]{64}$/);
  } finally { db.close(); }
  await start();
  assert.equal((await (await oldSession()).json()).account.id, first.id);
  assert.equal((await visitor("/login", { username: "测试新名", password: newPassword })).status, 200);
});
