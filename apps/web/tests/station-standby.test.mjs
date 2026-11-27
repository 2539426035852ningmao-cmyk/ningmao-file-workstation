import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import test from "node:test";
import { createRoomServer } from "../selfhost/server.mjs";

test("a prepared synthetic standby restores fixed room, membership and file at the same station address", async t => {
  const dir = await mkdtemp(join(tmpdir(), "ningmao-station-standby-"));
  const primary = join(dir, "primary");
  const standby = join(dir, "standby");
  await mkdir(standby);
  let server;
  async function listen(directory, port) {
    server = createRoomServer(directory).listen(port, "127.0.0.1");
    await once(server, "listening");
    return server.address().port;
  }
  async function stop() {
    if (!server) return;
    const stopped = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await stopped;
    server = undefined;
  }
  t.after(async () => { await stop(); await rm(dir, { recursive: true, force: true }); });
  const port = await listen(primary, 0);
  const origin = `http://127.0.0.1:${port}`;
  function connection() {
    let cookie = "";
    return async (path, data, extra) => {
      const json = data && !Buffer.isBuffer(data);
      const response = await fetch(origin + "/api/" + path, {
        method: data ? "POST" : "GET",
        headers: { Cookie: cookie, ...(json ? { "Content-Type": "application/json" } : {}), ...extra },
        body: json ? JSON.stringify(data) : data,
      });
      cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
      return response;
    };
  }
  const [owner, admin, newMember] = [connection(), connection(), connection()];
  const password = "test fixtures are never real secrets";
  const identities = [];
  for (const [client, username] of [[owner, "GroupOwner"], [admin, "StandbyAdmin"], [newMember, "NewMember"]]) {
    const signup = await client("account/register", { username, password });
    assert.equal(signup.status, 201);
    identities.push((await signup.json()).account.id);
  }
  await owner("social/request", { username: "StandbyAdmin" });
  await admin("social/accept", { id: identities[0] });
  const { code } = await (await owner("social/rooms", { name: "接管测试群", members: [identities[1]] })).json();
  const room = "rooms/" + code;
  const actor = (await (await admin(room)).json()).member;
  assert.equal((await owner(room + "/promote", { id: actor.id, enabled: true })).status, 200);
  assert.equal((await owner(room + "/hosting", { action: "designate", id: actor.id })).status, 200);
  const content = Buffer.from("standby synthetic attachment");
  const file = await owner(room + "/files", content, {
    "X-File-Name": "standby.txt", "X-SHA256": createHash("sha256").update(content).digest("hex"),
  });
  assert.equal(file.status, 201);
  const { id } = await file.json();
  assert.equal((await owner("social/messages", { room: code, text: "备用接手前的消息" })).status, 201);

  // This backup is created by the test operator and contains only synthetic site data.
  const read = new DatabaseSync(join(primary, "rooms.sqlite"), { readOnly: true });
  try { await backup(read, join(standby, "rooms.sqlite")); } finally { read.close(); }
  await stop();
  await assert.rejects(() => admin(room));
  assert.equal(await listen(standby, port), port);
  assert.equal((await admin(room + "/hosting", { action: "start" })).status, 200);
  const group = await (await admin(room)).json();
  assert.equal(group.title, "接管测试群");
  assert.equal(group.management.active, 1);
  assert.equal((await (await admin("social/messages?room=" + code)).json()).messages[0].body, "备用接手前的消息");
  assert.deepEqual(Buffer.from(await (await admin(room + "/files/" + id)).arrayBuffer()), content);
  const pending = (await (await newMember(room + "/join", {})).json()).member;
  assert.equal((await owner(room + "/decide", { id: pending.id, accept: true })).status, 403);
  assert.equal((await admin(room + "/decide", { id: pending.id, accept: true })).status, 200);
  assert.equal((await newMember(room)).status, 200);
});
