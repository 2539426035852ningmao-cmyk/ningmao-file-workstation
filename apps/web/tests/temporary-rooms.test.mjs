import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { createRoomServer } from "../selfhost/server.mjs";

async function roomClients(t) {
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
  return browser;
}

test("the owner occupies one place and only leaving or removal opens a full room", async t => {
  const browser = await roomClients(t);
  const owner = browser();
  const { code } = await (await owner("", { name: "群主", approval: true })).json();
  const path = "/" + code;
  const guests = Array.from({ length: 6 }, () => browser());
  const join = (guest, index) => guest(path + "/join", { name: "访客 " + (index + 1) });
  const applications = await Promise.all(guests.slice(0, 5).map(async (guest, index) => {
    const result = await join(guest, index);
    assert.equal(result.status, 200);
    const { member } = await result.json();
    assert.equal(member.status, "pending");
    return member;
  }));
  const decide = id => owner(path + "/decide", { id, accept: true });
  const approvals = await Promise.all(applications.map(({ id }) => decide(id)));
  const winners = approvals.flatMap((response, index) => response.ok ? [index] : []);
  const [waiting] = approvals.flatMap((response, index) => response.status === 409 ? [index] : []);
  assert.equal(winners.length, 4);
  assert.ok(Number.isInteger(waiting));
  const full = await join(guests[5], 5);
  assert.equal(full.status, 409);
  assert.match(await full.json(), /最多 5 人/);
  const view = async () => (await owner(path)).json();
  assert.equal((await view()).memberLimit, 5);
  assert.equal((await view()).members.filter(member => member.status === "active").length, 5);
  assert.equal((await view()).members.filter(member => member.status === "pending").length, 1);
  assert.equal((await guests[waiting](path)).status, 403);

  const [first, second] = winners;
  assert.equal((await guests[first](path + "/remove", { id: applications[second].id })).status, 403);
  assert.equal((await owner(path + "/leave", {})).status, 403);
  assert.equal((await guests[first](path + "/leave", {})).status, 200);
  assert.equal((await (await guests[first](path)).json()).status, "left");
  assert.equal((await decide(applications[waiting].id)).status, 200);
  assert.equal((await owner(path + "/remove", { id: applications[second].id })).status, 200);
  assert.equal((await (await guests[second](path)).json()).status, "removed");
  assert.equal((await join(guests[second], second)).status, 403);
  const returned = (await (await join(guests[first], first)).json()).member;
  assert.equal(returned.id, applications[first].id);
  assert.equal(returned.status, "pending");
  assert.equal((await decide(returned.id)).status, 200);
  assert.equal((await join(guests[5], 5)).status, 409);

  const openRoom = "/" + (await (await owner("", { name: "开放房间", approval: false })).json()).code;
  const attempts = await Promise.all(guests.map(guest => guest(openRoom + "/join", { name: "访客" })));
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 200, 200, 200, 409, 409]);
});

test("two browsers can exchange files, with approval and revocation enforced by the server", async t => {
  const browser = await roomClients(t);
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
  const denied = browser();
  const deniedMember = (await (await denied(path + "/join", { name: "未获批准" })).json()).member;
  assert.equal((await owner(path + "/decide", { id: deniedMember.id, accept: false })).status, 200);
  const deniedRoom = await denied(path);
  assert.equal(deniedRoom.status, 403);
  assert.equal((await deniedRoom.json()).status, "denied");
  const transfer = async (sender, receiver, text) => {
    const body = Buffer.from(text);
    const digest = createHash("sha256").update(body).digest("hex");
    const sent = await sender(path + "/files", null, {
      headers: { "X-File-Name": encodeURIComponent("合成.txt"), "X-SHA256": digest, "X-Upload-Id": digest.slice(0,32) },
      body,
    });
    assert.equal(sent.status, 201);
    const file = await sent.json();
    const retry = await sender(path + "/files", null, {
      headers: { "X-File-Name": encodeURIComponent("合成.txt"), "X-SHA256": digest, "X-Upload-Id": digest.slice(0,32) },
      body,
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).id, file.id);
    assert.equal((await browser()(path + "/files/" + file.id)).status, 403);
    assert.equal((await denied(path + "/files/" + file.id)).status, 403);
    const listing = await (await sender(path)).json();
    const initialExpiry = listing.files.find(item => item.id === file.id).expires;
    const day = 24 * 60 * 60 * 1000;
    for (let days = 1; days <= 3; days++) {
      const extension = await sender(path + "/extend", { id: file.id, expires: initialExpiry + days * day });
      assert.equal(extension.status, days <= 2 ? 200 : 409);
    }
    const received = await receiver(path + "/files/" + file.id);
    assert.equal(received.status, 200);
    assert.deepEqual(Buffer.from(await received.arrayBuffer()), body);
    assert.equal((await sender(path + "/revoke", { id: file.id })).status, 200);
    assert.equal((await receiver(path + "/files/" + file.id)).status, 404);
    const afterRevoke = await sender(path + "/files", null, {
      headers: { "X-File-Name": encodeURIComponent("合成.txt"), "X-SHA256": digest, "X-Upload-Id": digest.slice(0,32) },
      body,
    });
    assert.equal(afterRevoke.status, 410);
  };
  await transfer(owner, guest, "from browser A");
  await transfer(guest, owner, "from browser B");
});
