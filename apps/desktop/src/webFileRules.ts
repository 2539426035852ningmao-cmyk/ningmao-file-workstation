/** Shared by Windows->Web offers and Web->Windows receipts.
 * Rust uses the same 200 UTF-8-byte limit, 64 MiB cap and 64 KiB chunks.
 */
export const WEB_MAX_FILE_BYTES = 64 * 1024 * 1024;
export const WEB_CHUNK_BYTES = 64 * 1024;
export const WEB_MAX_FILENAME_BYTES = 200;
const BAD_NAME = /[\\/:*?"<>|\x00-\x1f\x7f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
export function safeWebFileName(name: string): boolean {
  return typeof name === "string" && name.length > 0 &&
    new TextEncoder().encode(name).length <= WEB_MAX_FILENAME_BYTES &&
    !!name.trim() && name !== "." && name !== ".." &&
    !name.endsWith(".") && !name.endsWith(" ") &&
    !BAD_NAME.test(name) && !RESERVED.test(name);
}
