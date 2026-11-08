import { invoke } from "@tauri-apps/api/core";

/** W3 strictly local source adapter: does not authenticate or transmit to a remote device. */
export type PreparedWebFile = {
  ticket: string;
  item_id: number;
  name: string;
  bytes: number;
  sha256: string;
  mime: string;
  expires_in_seconds: number;
};
export type WebFileChunk = {
  offset: number;
  bytes: number;
  data_base64: string;
  eof: boolean;
};
export type DesktopWebRTCOffer = {
  manifest: { id: string; name: string; size: number; mime: string; sha256: string };
  bytes: ArrayBuffer;
};
export const MAX_DESKTOP_WEB_BYTES = 64 * 1024 * 1024;
export const nativeWebTransferSource = {
  prepare(shelfId: number, itemId: number): Promise<PreparedWebFile> {
    // Local correlation ticket, never disclose it to a remote peer or URL.
    return invoke("web_transfer_prepare", {
      shelfId, itemId, ticket: crypto.randomUUID()
    });
  },
  readChunk(ticket: string, offset: number, size = 64 * 1024): Promise<WebFileChunk> {
    return invoke("web_transfer_read_chunk", { ticket, offset, size });
  },
  release(ticket: string): Promise<void> {
    return invoke("web_transfer_release", { ticket });
  }
};
/** Collects exactly one explicitly selected reference into the same manifest as W2 browser PeerLink.
 * Always releases the local permit. This is intentionally NOT a network send.
 */
export async function buildDesktopWebRTCOffer(
  shelfId: number,
  itemId: number,
  signal?: AbortSignal
): Promise<DesktopWebRTCOffer> {
  if (signal?.aborted) throw new Error("发送已取消");
  const prepared = await nativeWebTransferSource.prepare(shelfId, itemId);
  try {
    if (!Number.isSafeInteger(prepared.bytes) || prepared.bytes < 0 || prepared.bytes > MAX_DESKTOP_WEB_BYTES ||
        !/^[a-f0-9]{64}$/i.test(prepared.sha256) || !prepared.ticket) {
      throw new Error("源文件声明不符合 Web 传输安全要求");
    }
    const output = new ArrayBuffer(prepared.bytes);
    const view = new Uint8Array(output);
    const CHUNK_SIZE = 64 * 1024;
    for (let offset = 0; offset < prepared.bytes;) {
      if (signal?.aborted) throw new Error("发送已取消");
      const chunk = await nativeWebTransferSource.readChunk(prepared.ticket, offset, CHUNK_SIZE);
      if (chunk.offset !== offset || !Number.isInteger(chunk.bytes) ||
          chunk.bytes <= 0 || chunk.bytes > CHUNK_SIZE ||
          chunk.bytes > prepared.bytes - offset ||
          chunk.eof !== (offset + chunk.bytes === prepared.bytes)) {
        throw new Error("收到异常文件分块，已中止发送");
      }
      let decoded: string;
      try { decoded = atob(chunk.data_base64); }
      catch { throw new Error("源文件分块编码无效"); }
      if (decoded.length !== chunk.bytes) throw new Error("文件分块声明和实际内容不一致");
      for (let i = 0; i < decoded.length; i++) view[offset + i] = decoded.charCodeAt(i);
      offset += chunk.bytes;
    }
    if (signal?.aborted) throw new Error("发送已取消");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", output)))
      .map(v => v.toString(16).padStart(2, "0")).join("");
    if (digest !== prepared.sha256.toLowerCase()) throw new Error("本机文件读取后哈希校验失败，拒绝传输");
    return {
      manifest: {
        id: crypto.randomUUID(), name: prepared.name, size: prepared.bytes,
        mime: prepared.mime, sha256: digest
      },
      bytes: output
    };
  } finally {
    try { await nativeWebTransferSource.release(prepared.ticket); }
    catch { /* Permit also expires automatically; never hide the original error. */ }
  }
}
