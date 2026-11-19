import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const FILE_CHUNK = 4 * 1024 * 1024;
export const FILE_MAX = 20_000_000_000;
type Receipt = { id: string; size: number; offset: number; expires: number | null; chunkBytes: number };
type Progress = (text: string, bytes: number, total: number) => void;

async function receiveReceipt(response: Response): Promise<Receipt> {
  if (!response.ok) throw new Error(await response.json());
  const receipt = await response.json();
  if (!/^[a-f0-9]{32}$/.test(receipt.id) || receipt.chunkBytes !== FILE_CHUNK ||
      !Number.isSafeInteger(receipt.offset) || receipt.offset < 0 || receipt.offset > receipt.size) {
    throw new Error("站点返回了无效上传进度。");
  }
  return receipt;
}

export async function uploadBulk(api: string, file: File, report: Progress) {
  if (file.size > FILE_MAX) throw new Error("单文件最多 20 GB。");
  const digest = sha256.create();
  for (let offset = 0; offset < file.size; offset += FILE_CHUNK) {
    digest.update(new Uint8Array(await file.slice(offset, offset + FILE_CHUNK).arrayBuffer()));
    report("校验来源", Math.min(offset + FILE_CHUNK, file.size), file.size);
  }
  const hash = bytesToHex(digest.digest());
  const storageKey = JSON.stringify(["room-chunks", api, file.name, hash]);
  const request = localStorage.getItem(storageKey) ?? crypto.randomUUID().replace(/-/g, "");
  localStorage.setItem(storageKey, request);
  let receipt = await receiveReceipt(await fetch(api + "/bulk", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, digest: hash, request }),
  }));
  if (receipt.size !== file.size) throw new Error("站点记录的文件大小已改变。");
  const path = api + "/bulk/" + receipt.id;
  const id = receipt.id;
  while (receipt.offset < file.size) {
    const part = await file.slice(receipt.offset, receipt.offset + FILE_CHUNK).arrayBuffer();
    const next = await receiveReceipt(await fetch(path, {
      method: "POST",
      headers: { "X-Offset": String(receipt.offset), "X-SHA256": bytesToHex(sha256(new Uint8Array(part))) },
      body: part,
    }));
    if (next.id !== id || next.size !== file.size || next.offset !== receipt.offset + part.byteLength) {
      throw new Error("上传回执不匹配，已停止，请重新选择原文件续传。");
    }
    receipt = next;
    report("上传", receipt.offset, file.size);
  }
  report("站点校验", file.size, file.size);
  const published = await receiveReceipt(await fetch(path + "/publish", { method: "POST" }));
  if (published.id !== id || !published.expires) throw new Error("站点尚未确认发布。");
  localStorage.removeItem(storageKey);
}

export function downloadBulk(url: string, item: { id: string; digest: string; size: number }, report: Progress): Promise<File> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./bulkDownload.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (typeof data.progress === "number") { report("下载", data.progress, item.size); return; }
      worker.terminate();
      if (data.file) resolve(data.file);
      else reject(new Error(data.error ?? "下载中断，请重试。"));
    };
    worker.onerror = () => { worker.terminate(); reject(new Error("无法启动分块下载。")); };
    worker.postMessage({ url, ...item });
  });
}
