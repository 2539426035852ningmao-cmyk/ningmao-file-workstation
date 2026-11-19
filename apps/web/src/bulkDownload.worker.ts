/// <reference lib="webworker" />
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const chunkSize = 4 * 1024 * 1024;

globalThis.onmessage = async ({ data }: MessageEvent<{ url: string; id: string; digest: string; size: number }>) => {
  try {
    if (!/^[a-f0-9]{32}$/.test(data.id) || !/^[a-f0-9]{64}$/.test(data.digest)) throw new Error("文件声明无效。");
    if (!navigator.storage?.getDirectory) throw new Error("此浏览器无法保存续传进度。");
    const space = await navigator.storage.getDirectory();
    const directory = await space.getDirectoryHandle("ningmao-transfers", { create: true });
    const handle = await directory.getFileHandle(data.id + "-" + data.digest, { create: true });
    const target = await handle.createSyncAccessHandle();
    const hash = sha256.create();
    try {
      const stored = target.getSize();
      if (stored > data.size) target.truncate(0);
      const existing = target.getSize();
      const bytes = new Uint8Array(chunkSize);
      for (let offset = 0; offset < existing;) {
        const count = target.read(bytes.subarray(0, Math.min(chunkSize, existing - offset)), { at: offset });
        if (count <= 0) throw new Error("无法读取已有下载进度。");
        hash.update(bytes.subarray(0, count));
        offset += count;
      }
      for (let offset = existing; offset < data.size;) {
        const end = Math.min(offset + chunkSize, data.size) - 1;
        const request = await fetch(data.url, { headers: { Range: `bytes=${offset}-${end}` } });
        if (request.status !== 206 || request.headers.get("Content-Range") !== `bytes ${offset}-${end}/${data.size}`) {
          throw new Error("当前来源无法提供这个分块，已保留下载进度。");
        }
        const piece = new Uint8Array(await request.arrayBuffer());
        if (piece.length !== end - offset + 1) throw new Error("分块未收齐，已保留下载进度。");
        try {
          if (target.write(piece, { at: offset }) !== piece.length) throw new Error("可用暂存空间不足。");
          target.flush();
        } catch (error) {
          target.truncate(offset);
          throw error;
        }
        hash.update(piece);
        offset += piece.length;
        globalThis.postMessage({ progress: offset });
      }
      if (bytesToHex(hash.digest()) !== data.digest) {
        target.truncate(0);
        throw new Error("完整文件校验失败，清空暂存后可重试。");
      }
    } finally {
      target.close();
    }
    globalThis.postMessage({ file: await handle.getFile() });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : "下载中断，已保留进度。" });
  }
};
