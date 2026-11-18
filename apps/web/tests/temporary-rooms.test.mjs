import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { createRoomServer } from "../selfhost/server.mjs";

test("two browsers can exchange files, with approval and revocation enforced by the server", async t => {
  const root = await mkdtemp(join(tmpdir(), "ningmao-room-"));
  const server = createRoomServer(root).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api/rooms`;
  const browser = () => {
    let cookie = "";
    return async (suffix, data, upload) => {
      const headers = { Cookie: cookie };
      if (data) headers["Content-Type"] = "application/json";
      if (upload) Object.assign(headers, upload.headers);
      const response = await fetch(base + suffix, {
        method: data || upload ? "POST" : "GET",
        headers,
        body: upload?.body ?? (data ? JSON.stringify(data) : undefined),
      });
      cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
      return response;
    };
  };
  const owner = browser();
  const guest = browser();
  const created = await owner("", { name: "主持者", approval: true });
  assert.equal(created.status, 201);
  const { code } = await created.json();
  const path = "/" + code;
  const { member } = await (await guest(path + "/join", { name: "访客" })).json();
  assert.equal(member.status, "pending");
  assert.equal((await guest(path)).status, 403);
  assert.equal((await owner(path + "/decide", { id: member.id, accept: true })).status, 200);
  const transfer = async (sender, receiver, text) => {
    const body = Buffer.from(text);
    const digest = createHash("sha256").update(body).digest("hex");
    const sent = await sender(path + "/files", null, {
      headers: { "X-File-Name": encodeURIComponent("合成.txt"), "X-SHA256": digest },
      body,
    });
    assert.equal(sent.status, 201);
    const file = await sent.json();
    assert.equal((await browser()(path + "/files/" + file.id)).status, 403);
    const received = await receiver(path + "/files/" + file.id);
    assert.equal(received.status, 200);
    assert.deepEqual(Buffer.from(await received.arrayBuffer()), body);
    assert.equal((await sender(path + "/revoke", { id: file.id })).status, 200);
    assert.equal((await receiver(path + "/files/" + file.id)).status, 404);
  };
  await transfer(owner, guest, "from browser A");
  await transfer(guest, owner, "from browser B");
});
