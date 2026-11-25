import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { FILE_CHUNK } from "./bulkTransfer";

const FRAME_BYTES = 32 * 1024;
const key = () => crypto.randomUUID().replace(/-/g, "");
type Signal = {
  from: string;
  file: string;
  connection: string;
  description: RTCSessionDescriptionInit;
};
type Session = {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  from: string;
  file: string;
};
type SourceInfo = { sources: string[]; digest: string | null };

function deadline<T>(operation: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    operation.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

function waitFor(target: EventTarget, event: string, stop?: string) {
  return new Promise<void>((resolve, reject) => {
    function cleanup() {
      target.removeEventListener(event, received);
      if (stop) target.removeEventListener(stop, closed);
    }
    function received() { cleanup(); resolve(); }
    function closed() { cleanup(); reject(new Error("供件连接已断开。")); }
    target.addEventListener(event, received, { once: true });
    if (stop) target.addEventListener(stop, closed, { once: true });
  });
}

async function completeDescription(peer: RTCPeerConnection, description: RTCSessionDescriptionInit) {
  await peer.setLocalDescription(description);
  if (peer.iceGatheringState !== "complete") {
    await deadline(new Promise<void>(resolve => {
      const check = () => {
        if (peer.iceGatheringState === "complete") {
          peer.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      peer.addEventListener("icegatheringstatechange", check);
    }), 1800, "未找到可直连地址。").catch(() => undefined);
  }
  return peer.localDescription!.toJSON();
}

export class RoomPeerSources {
  #client = key();
  #events: EventSource;
  #local = new Map<string, File>();
  #incoming = new Map<string, { file: string; peer: RTCPeerConnection }>();
  #outgoing = new Map<string, Session>();
  #online = false;

  constructor(private api: string) {
    this.#events = new EventSource(this.#path());
    this.#events.addEventListener("connected", () => {
      this.#online = true;
      for (const file of this.#local.keys()) void this.#post({ file, enabled: true }).catch(() => undefined);
    });
    this.#events.onerror = () => { this.#online = false; };
    this.#events.addEventListener("heartbeat", () => {
      if (this.#local.size) void this.#post({ heartbeat: true }).catch(() => undefined);
    });
    this.#events.addEventListener("signal", event => {
      const signal: Signal = JSON.parse(event.data);
      void this.#signal(signal).catch(() => {
        this.#incoming.get(signal.connection)?.peer.close();
        this.#incoming.delete(signal.connection);
      });
    });
  }

  #path() { return this.api + "/peers/" + this.#client; }

  async #post(value: object) {
    const response = await fetch(this.#path(), {
      method: "POST", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error("当前供件连接不可用。");
  }

  async #info(file: string, offset: number): Promise<SourceInfo> {
    const response = await fetch(this.api + "/sources/" + file + "?offset=" + offset + "&client=" + this.#client,
      { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("文件已撤回、到期或无法访问。");
    return response.json();
  }

  async share(id: string, file: File | null) {
    if (file) {
      if (!this.#online) throw new Error("供件连接正在建立，请稍后重试。");
      this.#local.set(id, file);
      try { await this.#post({ file: id, enabled: true }); }
      catch (error) { this.#local.delete(id); throw error; }
    } else {
      this.#local.delete(id);
      for (const [connection, active] of this.#incoming) {
        if (active.file !== id) continue;
        active.peer.close();
        this.#incoming.delete(connection);
      }
      await this.#post({ file: id, enabled: false }).catch(() => undefined);
    }
  }

  async #signal(signal: Signal) {
    const { connection, file, from, description } = signal;
    if (description.type === "answer") {
      const session = this.#outgoing.get(connection);
      if (session?.from === from && session.file === file) await session.peer.setRemoteDescription(description);
      return;
    }
    const source = this.#local.get(file);
    if (description.type !== "offer" || !source || !this.#online || this.#incoming.has(connection) || this.#incoming.size >= 8) return;
    const peer = new RTCPeerConnection();
    this.#incoming.set(connection, { file, peer });
    const close = () => { peer.close(); this.#incoming.delete(connection); };
    const connectionTimeout = window.setTimeout(close, 10_000);
    peer.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(peer.connectionState)) {
        window.clearTimeout(connectionTimeout);
        close();
      }
    };
    peer.ondatachannel = event => {
      const channel = event.channel;
      if (channel.label !== "ningmao-bulk" || this.#local.get(file) !== source) { close(); return; }
      window.clearTimeout(connectionTimeout);
      let sending = false;
      channel.bufferedAmountLowThreshold = 256 * 1024;
      channel.onclose = close;
      channel.onmessage = event => {
        const offset = Number(event.data);
        if (typeof event.data !== "string" || !/^\d+$/.test(event.data) || !Number.isSafeInteger(offset)
            || offset < 0 || offset >= source.size || offset % FILE_CHUNK !== 0 || sending) {
          close();
          return;
        }
        sending = true;
        void this.#serve(channel, file, source, offset).catch(close).finally(() => { sending = false; });
      };
    };
    await peer.setRemoteDescription(description);
    const response = await completeDescription(peer, await peer.createAnswer());
    await this.#post({ to: from, connection, file, description: response });
  }

  async #serve(channel: RTCDataChannel, file: string, source: File, offset: number) {
    if (this.#local.get(file) !== source || !(await this.#info(file, offset)).digest) throw new Error("供件已停止。");
    const part = await source.slice(offset, offset + FILE_CHUNK).arrayBuffer();
    for (let index = 0; index < part.byteLength; index += FRAME_BYTES) {
      if (channel.readyState !== "open" || this.#local.get(file) !== source) throw new Error("供件已暂停。");
      if (channel.bufferedAmount > 512 * 1024) {
        await deadline(waitFor(channel, "bufferedamountlow", "close"), 6000, "供件等待超时。");
      }
      channel.send(part.slice(index, index + FRAME_BYTES));
    }
    channel.send("done");
  }

  download(file: string) {
    const sessions = new Map<string, { connection: string; session: Session }>();
    const failed = new Set<string>();
    const release = (from: string) => {
      const active = sessions.get(from);
      if (!active) return;
      active.session.peer.close();
      this.#outgoing.delete(active.connection);
      sessions.delete(from);
    };
    const connect = async (from: string) => {
      const existing = sessions.get(from);
      if (existing) return existing.session;
      const connection = key();
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel("ningmao-bulk", { ordered: true });
      channel.binaryType = "arraybuffer";
      const connected = waitFor(channel, "open", "close");
      void connected.catch(() => undefined);
      const session = { peer, channel, from, file };
      sessions.set(from, { connection, session });
      this.#outgoing.set(connection, session);
      const description = await completeDescription(peer, await peer.createOffer());
      await this.#post({ to: from, connection, file, description });
      await deadline(connected, 6000, "无法直连供件设备。");
      return session;
    };
    return {
      block: async (offset: number, length: number) => {
        if (!this.#online) return null;
        const info = await this.#info(file, offset).catch(() => null);
        if (!info?.digest) return null;
        for (const from of info.sources.filter(source => !failed.has(source)).slice(0, 3)) {
          try {
            const { channel } = await connect(from);
            const bytes = await receiveBlock(channel, offset, length);
            if (bytesToHex(sha256(bytes)) !== info.digest) throw new Error("来源分块校验失败。");
            return bytes.buffer;
          } catch {
            failed.add(from);
            release(from);
          }
        }
        return null;
      },
      close: () => { for (const from of sessions.keys()) release(from); },
    };
  }

  close() {
    this.#online = false;
    this.#events.close();
    this.#local.clear();
    for (const { peer } of this.#incoming.values()) peer.close();
    for (const { peer } of this.#outgoing.values()) peer.close();
    this.#incoming.clear();
    this.#outgoing.clear();
  }
}

async function receiveBlock(channel: RTCDataChannel, offset: number, size: number) {
  const bytes = new Uint8Array(size);
  let position = 0;
  const piece = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    channel.onclose = () => reject(new Error("供件设备已离线。"));
    channel.onmessage = ({ data }) => {
      if (data === "done" && position === size) { resolve(bytes); return; }
      if (!(data instanceof ArrayBuffer) || position + data.byteLength > size) {
        reject(new Error("供件分块不完整。"));
        return;
      }
      bytes.set(new Uint8Array(data), position);
      position += data.byteLength;
    };
    channel.send(String(offset));
  });
  try { return await deadline(piece, 7000, "供件分块等待超时。"); }
  finally { channel.onmessage = null; channel.onclose = null; }
}
