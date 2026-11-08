import { expect, test } from "@playwright/test";

test("real Chromium DataChannel transfers exact bytes with SHA-256", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ PeerLink }, { hex }] = await Promise.all([
      import("../../src/peer"), import("../../src/guards")
    ]);
    const content = "Ningmao W2 browser integration · 合成文件 \u0000\u0001 传输内容";
    const bytes = new TextEncoder().encode(content).buffer;
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
    const id = crypto.randomUUID();
    const meta = { id, name: "W2-合成.txt", size: bytes.byteLength, mime: "text/plain", sha256 };
    let sender: InstanceType<typeof PeerLink>;
    let receiver: InstanceType<typeof PeerLink>;
    let senderStatus = "";
    let senderChunks = 0;
    let received = "";
    const failure = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("WebRTC DataChannel 连接或传输超时")), 20_000);
    });
    const complete = new Promise<string>((resolve, reject) => {
      const report = (message: string) => reject(new Error(message));
      sender = new PeerLink({
        remote: "receiver", signal: message => {
          void receiver.handle(message.type, message.payload).catch(err => report(String(err)));
        },
        progress: () => senderChunks++,
        ready: () => report("发送端不应接收数据"),
        transmitted: () => { senderStatus = "queued"; },
        error: report
      });
      receiver = new PeerLink({
        remote: "sender", signal: message => {
          void sender.handle(message.type, message.payload).catch(err => report(String(err)));
        },
        progress: () => {},
        ready: (blob, incoming) => {
          if (incoming.id !== id) { report("传输任务 ID 不匹配"); return; }
          void blob.text().then(text => { received = text; resolve(text); }).catch(report);
        },
        transmitted: () => report("接收端不应发送数据"),
        error: report
      });
      receiver.prepareReceiver(meta);
      void sender.startSender(bytes, meta).catch(err => report(String(err)));
    });
    try {
      await Promise.race([complete, failure]);
      return { expected: content, received, senderStatus, senderChunks, sha256 };
    } finally {
      sender!.close();
      receiver!.close();
    }
  });
  expect(result.received).toBe(result.expected);
  expect(result.senderChunks).toBeGreaterThan(0);
  expect(result.senderStatus).toBe("queued");
  expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
});

test("invalid content checksum blocks verified receive", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { PeerLink } = await import("../../src/peer");
    const bytes = new TextEncoder().encode("synthetic corrupt checksum").buffer;
    const meta = {
      id: crypto.randomUUID(), name: "bad-checksum.txt",
      size: bytes.byteLength, mime: "text/plain", sha256: "0".repeat(64)
    };
    let sender: InstanceType<typeof PeerLink>;
    let receiver: InstanceType<typeof PeerLink>;
    let received = false;
    const timeout = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("未出现哈希校验失败提示")), 20_000)
    );
    const failed = new Promise<string>((resolve, reject) => {
      sender = new PeerLink({
        remote: "receiver",
        signal: msg => { void receiver.handle(msg.type, msg.payload).catch(reject); },
        progress: () => {}, ready: () => { received = true; },
        transmitted: () => {}, error: reject
      });
      receiver = new PeerLink({
        remote: "sender",
        signal: msg => { void sender.handle(msg.type, msg.payload).catch(reject); },
        progress: () => {}, ready: () => { received = true; },
        transmitted: () => {}, error: resolve
      });
      receiver.prepareReceiver(meta);
      void sender.startSender(bytes, meta).catch(reject);
    });
    try {
      const error = await Promise.race([failed, timeout]);
      return { error, received };
    } finally {
      sender!.close();
      receiver!.close();
    }
  });
  expect(result.error).toContain("哈希校验失败");
  expect(result.received).toBe(false);
});
