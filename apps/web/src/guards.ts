export const MAX_BYTES = 64 * 1024 * 1024;
export type Invite = { id: string; name: string; size: number; mime: string; sha256: string };
const HEX = /^[a-f\d]{64}$/i;
const BAD_WINDOWS_NAME = /[\\/:*?"<>|\x00-\x1f\x7f]/;
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
export function safeFileName(name: string): boolean {
  return name.length > 0 && name.length <= 200 && name.trim().length > 0 &&
    name !== "." && name !== ".." && !name.endsWith(".") && !name.endsWith(" ") &&
    !BAD_WINDOWS_NAME.test(name) && !RESERVED_DEVICE_NAME.test(name);
}
export function validInvite(value: unknown): value is Invite {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === "string" && /^[0-9a-f-]{36}$/i.test(p.id) &&
    typeof p.name === "string" && safeFileName(p.name) &&
    typeof p.size === "number" && Number.isSafeInteger(p.size) && p.size >= 0 && p.size <= MAX_BYTES &&
    typeof p.mime === "string" && p.mime.length <= 100 &&
    typeof p.sha256 === "string" && HEX.test(p.sha256);
}
export function readable(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function shortName(name: string) { return name.length > 48 ? name.slice(0, 46) + "…" : name; }
