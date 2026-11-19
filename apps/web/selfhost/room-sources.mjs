import { randomBytes } from "node:crypto";

const validKey = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const MAX_STREAMS = 256;
const MAX_STREAMS_PER_MEMBER = 3;
const MAX_SIGNAL_BYTES = 24 * 1024;
export class RoomSources {
  #clients = new Map();

  connect(room, member, session, client, response, active) {
    const prefix = room + "/";
    const key = prefix + client;
    const sameMember = [...this.#clients.entries()].filter(([id, record]) => id.startsWith(prefix) && record.member === member);
    const previous = this.#clients.get(key);
    if (previous && previous.session !== session) return false;
    if (!previous && (this.#clients.size >= MAX_STREAMS || sameMember.length >= MAX_STREAMS_PER_MEMBER)) return false;
    previous?.response.end();
    const record = { response, member, session, active, files: new Set(), signalAt: 0, signals: 0 };
    this.#clients.set(key, record);
    response.writeHead(200, { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
    response.write("event: connected\ndata: {}\n\n");
    const timer = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
    timer.unref();
    response.once("close", () => {
      clearInterval(timer);
      if (this.#clients.get(key) === record) this.#clients.delete(key);
    });
    return true;
  }

  advertise(room, session, client, file, enabled) {
    const record = this.#clients.get(room + "/" + client);
    if (!record || record.session !== session || typeof enabled !== "boolean") return false;
    if (enabled) {
      if (record.files.size >= 16 && !record.files.has(file)) return false;
      record.files.add(file);
    } else record.files.delete(file);
    return true;
  }

  list(room, file, client) {
    const prefix = room + "/";
    return [...this.#clients.entries()]
      .filter(([key, value]) => key.startsWith(prefix) && key !== prefix + client && value.active() && value.files.has(file))
      .map(([key]) => key.slice(prefix.length));
  }

  relay(room, session, client, input) {
    const from = this.#clients.get(room + "/" + client);
    const to = validKey(input.to) && this.#clients.get(room + "/" + input.to);
    if (!from || from.session !== session || !to || !to.active() || from === to || !validKey(input.connection) ||
        !validKey(input.file) || !["offer", "answer"].includes(input.description?.type) ||
        typeof input.description.sdp !== "string" || input.description.sdp.length > MAX_SIGNAL_BYTES) return false;
    const type = input.description.type;
    if (!(type === "offer" ? to : from).files.has(input.file)) return false;
    const now = Date.now();
    if (now - from.signalAt >= 10_000) {
      from.signalAt = now;
      from.signals = 0;
    }
    if (++from.signals > 32 || to.response.writableLength > MAX_SIGNAL_BYTES * 4) return false;
    const details = { from: client, connection: input.connection, file: input.file,
      description: { type, sdp: input.description.sdp } };
    to.response.write("event: signal\ndata: " + JSON.stringify(details) + "\n\n");
    return true;
  }

  revoke(room, file) {
    const prefix = room + "/";
    for (const [key, record] of this.#clients) {
      if (key.startsWith(prefix)) record.files.delete(file);
    }
  }

  close() {
    for (const { response } of this.#clients.values()) response.end();
    this.#clients.clear();
  }
}
