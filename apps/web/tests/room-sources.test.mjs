import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { RoomSources } from "../selfhost/room-sources.mjs";

class OpenStream extends EventEmitter {
  writeHead() {}
  write() {}
  end() { this.emit("close"); }
}

test("a silent source stops being offered even if its stream remains open", t => {
  t.mock.timers.enable({ apis: ["Date"], now: 100 });
  const sources = new RoomSources();
  t.after(() => sources.close());
  const client = "a".repeat(32);
  const reader = "b".repeat(32);
  const file = "c".repeat(32);
  const offer = { to: client, file, connection: "d".repeat(32), description: { type: "offer", sdp: "synthetic" } };
  sources.connect("room", "member", "session", client, new OpenStream(), () => true);
  sources.connect("room", "guest", "reader-session", reader, new OpenStream(), () => true);
  assert.equal(sources.advertise("room", "session", client, file, true), true);
  assert.deepEqual(sources.list("room", file, reader), [client]);
  assert.equal(sources.relay("room", "reader-session", reader, offer), true);
  assert.equal(sources.relay("room", "reader-session", reader, offer, id => id === "guest"), false);

  t.mock.timers.tick(31_000);
  assert.deepEqual(sources.list("room", file, reader), []);
  assert.equal(sources.relay("room", "reader-session", reader, offer), false);
  assert.equal(sources.heartbeat("room", "reader-session", client), false);
  assert.deepEqual(sources.list("room", file, reader), []);
  assert.equal(sources.heartbeat("room", "session", client), true);
  assert.deepEqual(sources.list("room", file, reader), [client]);
  assert.equal(sources.advertise("room", "session", client, file, false), true);
  assert.deepEqual(sources.list("room", file, reader), []);
});
