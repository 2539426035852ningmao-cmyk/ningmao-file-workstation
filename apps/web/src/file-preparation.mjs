import {classifyFile, totalSize} from "./file-utils.mjs";

export const MAX_BROWSER_TRANSFER_FILES = 16;
export const MAX_BROWSER_TRANSFER_BYTES = 64 * 1024 * 1024;
const BAD_NAME = /[\\/:*?"<>|\x00-\x1f\x7f]/;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

// Incoming filenames are untrusted. Keep validation aligned with W2/Rust.
export function safeFileName(name) {
  return typeof name === "string" && name.length > 0 && new TextEncoder().encode(name).length <= 200 &&
    name.trim().length > 0 && name !== "." && name !== ".." &&
    !name.endsWith(".") && !name.endsWith(" ") &&
    !BAD_NAME.test(name) && !RESERVED_NAME.test(name);
}
export function fileKey(file) {
  return JSON.stringify([file.name, file.size, file.lastModified]);
}
export function addDistinct(current, incoming, createId) {
  const items = [...current], seen = new Set(current.map(item => fileKey(item.file)));
  let added = 0, duplicates = 0, invalid = 0;
  for (const file of incoming) {
    if (!file || !safeFileName(file.name) || !Number.isSafeInteger(file.size) ||
        file.size < 0 || typeof file.lastModified !== "number" ||
        (file.webkitRelativePath && file.webkitRelativePath.includes("/"))) {
      invalid++;
      continue;
    }
    const key = fileKey(file);
    if (seen.has(key)) { duplicates++; continue; }
    items.push({id: createId(), file});
    seen.add(key);
    added++;
  }
  return {items, added, duplicates, invalid};
}
export function queueReview(items) {
  const oversizedIds = items.filter(item => item.file.size > MAX_BROWSER_TRANSFER_BYTES).map(item => item.id);
  return {
    count: items.length,
    bytes: totalSize(items.map(item => item.file)),
    oversizedIds,
    excessCount: Math.max(0, items.length - MAX_BROWSER_TRANSFER_FILES)
  };
}
export function visibleQueue(items, query = "", kind = "all", sort = "added") {
  const search = query.trim().toLocaleLowerCase();
  const filtered = items.filter(item => (
    (!search || item.file.name.toLocaleLowerCase().includes(search)) &&
    (kind === "all" || classifyFile(item.file.name) === kind)
  ));
  if (sort === "name") return filtered.sort((a, b) => a.file.name.localeCompare(b.file.name, "zh"));
  if (sort === "size") return filtered.sort((a, b) => b.file.size - a.file.size);
  return filtered;
}
