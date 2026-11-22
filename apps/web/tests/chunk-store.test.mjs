import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { ChunkStore, CHUNK_BYTES, MAX_BULK_BYTES, retention } from "../selfhost/chunk-store.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("disk upload resumes after restart, verifies chunks, and publishes only after final hash", async t => {
  const root = await mkdtemp(join(tmpdir(), "ningmao-chunks-"));
  let store = new ChunkStore(root, MAX_BULK_BYTES);
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const first = Buffer.alloc(CHUNK_BYTES, 59);
  const tail = Buffer.from("尾部分块");
  const digest = sha(Buffer.concat([first, tail]));
  const proposed = { room: "room-a", member: "member-a", request: "7".repeat(32), size: first.length + tail.length, digest };
  const opened = store.open(proposed);
  assert.equal(opened.offset, 0);
  await assert.rejects(store.append(opened.id, "member-b", 0, first, sha(first)), /没有权限/);
  await assert.rejects(store.append(opened.id, "member-a", 0, first, "0".repeat(64)), /校验失败/);
  assert.equal((await store.append(opened.id, "member-a", 0, first, sha(first))).offset, first.length);
  await assert.rejects(store.publish(opened.id, "member-a"), /未收齐/);
  store.close();
  store = new ChunkStore(root, MAX_BULK_BYTES);
  assert.equal(store.open(proposed).offset, first.length);
  await assert.rejects(store.append(opened.id, "member-a", 0, tail, sha(tail)), /偏移/);
  await store.append(opened.id, "member-a", first.length, tail, sha(tail));
  const published = await store.publish(opened.id, "member-a", 1_000);
  assert.equal(published.expires, 1_000 + 24 * 60 * 60 * 1_000);
  assert.equal(sha(await readFile(store.path(published.id, proposed.room, 1_001))), digest);
  assert.throws(() => store.path(published.id, proposed.room, published.expires), /到期/);
  store.purge(published.expires);
  assert.throws(() => store.open(proposed), error => error.status === 410);
});

test("applies the 10 GB retention boundary and the 20 GB single-file ceiling", async t => {
  assert.equal(retention(10_000_000_000 - 1).hours, 24);
  assert.deepEqual(retention(10_000_000_000), { hours: 6, maxHours: 24 });
  const root = await mkdtemp(join(tmpdir(), "ningmao-oversize-"));
  const store = new ChunkStore(root, MAX_BULK_BYTES);
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  assert.throws(() => store.open({ room: "r", member: "m", request: "1".repeat(32), size: MAX_BULK_BYTES + 1, digest: "0".repeat(64) }), /20 GB/);
});
