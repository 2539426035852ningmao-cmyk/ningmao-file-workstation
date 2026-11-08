import { hex, type Invite, MAX_BYTES } from "./guards";

export type WireSignal = { type: "description" | "candidate"; to: string; payload: Record<string, unknown> };
type Hooks = {
  remote: string;
  signal: (message: WireSignal) => void;
  progress: (received: number, total: number) => void;
  ready: (blob: Blob, invite: Invite) => void;
  error: (message: string) => void;
  transmitted: () => void;
};

export class PeerLink {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private invite: Invite | null = null;
  private incoming: ArrayBuffer[] = [];
  private length = 0;
  private pendingIce: RTCIceCandidateInit[] = [];
  private stopped = false;
  constructor(private hooks: Hooks) {
    // No TURN in W0: some restrictive networks will require a later relay.
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.pc.onicecandidate = event => {
      if (event.candidate && !this.stopped) this.hooks.signal({
        type: "candidate", to: this.hooks.remote, payload: { id: this.invite?.id ?? "", candidate: event.candidate.toJSON() }
      });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" && !this.stopped)
        this.hooks.error("设备之间无法建立直连，可能需要 TURN 中继");
    };
  }
  async startSender(bytes: ArrayBuffer, meta: Invite) {
    this.invite = meta;
    const channel = this.pc.createDataChannel("ningmao-transfer", { ordered: true });
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.onopen = () => void this.sendBytes(bytes).catch(error => this.fail(error));
    channel.onerror = () => this.hooks.error("文件传输通道异常");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.hooks.signal({ type: "description", to: this.hooks.remote, payload: { id: meta.id, description: this.pc.localDescription!.toJSON() } });
  }
  prepareReceiver(meta: Invite) {
    this.invite = meta;
    this.pc.ondatachannel = event => {
      const channel = event.channel;
      this.channel = channel;
      channel.binaryType = "arraybuffer";
      channel.onmessage = e => void this.receive(e.data);
      channel.onerror = () => this.hooks.error("接收通道发生错误");
    };
  }
  async handle(type: "description" | "candidate", payload: Record<string, unknown>) {
    if (this.stopped || payload.id !== this.invite?.id) return;
    if (type === "candidate") {
      const ice = payload.candidate as RTCIceCandidateInit | undefined;
      if (!ice || typeof ice.candidate !== "string") return;
      if (!this.pc.remoteDescription) this.pendingIce.push(ice);
      else await this.pc.addIceCandidate(ice);
      return;
    }
    const desc = payload.description as RTCSessionDescriptionInit | undefined;
    if (!desc || (desc.type !== "offer" && desc.type !== "answer") || typeof desc.sdp !== "string") return;
    await this.pc.setRemoteDescription(desc);
    while (this.pendingIce.length) await this.pc.addIceCandidate(this.pendingIce.shift()!);
    if (desc.type === "offer") {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.hooks.signal({ type: "description", to: this.hooks.remote, payload: { id: this.invite!.id, description: this.pc.localDescription!.toJSON() } });
    }
  }
  private async sendBytes(data: ArrayBuffer) {
    const channel = this.channel;
    if (!channel || !this.invite) return;
    for (let offset = 0; offset < data.byteLength; offset += 32 * 1024) {
      if (this.stopped || channel.readyState !== "open") throw new Error("通道已关闭");
      if (channel.bufferedAmount > 512 * 1024) await this.drain(channel);
      channel.send(data.slice(offset, Math.min(data.byteLength, offset + 32 * 1024)));
      this.hooks.progress(Math.min(data.byteLength, offset + 32 * 1024), data.byteLength);
    }
    if (!this.stopped && channel.readyState === "open") {
      channel.send("DONE");
      this.hooks.transmitted();
    }
  }
  private drain(channel: RTCDataChannel) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error("等待网络发送缓冲区超时")); }, 30_000);
      const cleanup = () => {
        clearTimeout(timeout);
        channel.removeEventListener("bufferedamountlow", done);
        channel.removeEventListener("close", closed);
      };
      const done = () => { cleanup(); resolve(); };
      const closed = () => { cleanup(); reject(new Error("连接已断开")); };
      channel.addEventListener("bufferedamountlow", done, { once: true });
      channel.addEventListener("close", closed, { once: true });
      if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) done();
    });
  }
  private async receive(payload: unknown) {
    if (this.stopped || !this.invite) return;
    if (payload === "DONE") {
      if (this.length !== this.invite.size) { this.hooks.error("接收字节数与文件大小不一致"); return; }
      const blob = new Blob(this.incoming, { type: this.invite.mime || "application/octet-stream" });
      const digest = hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
      if (digest !== this.invite.sha256.toLowerCase()) { this.hooks.error("文件哈希校验失败，已阻止保存"); return; }
      this.hooks.ready(blob, this.invite);
      return;
    }
    if (!(payload instanceof ArrayBuffer)) return;
    this.length += payload.byteLength;
    if (this.length > this.invite.size || this.length > MAX_BYTES) {
      this.hooks.error("数据超过预期大小，已停止接收"); this.close(); return;
    }
    this.incoming.push(payload);
    this.hooks.progress(this.length, this.invite.size);
  }
  private fail(error: unknown) { if (!this.stopped) this.hooks.error(error instanceof Error ? error.message : String(error)); }
  close() {
    this.stopped = true;
    this.channel?.close();
    this.pc.close();
    this.incoming = [];
  }
}
