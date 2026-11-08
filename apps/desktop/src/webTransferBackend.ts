import { invoke } from "@tauri-apps/api/core";

/** W3 window-scoped local source only; transport/sign-in are intentionally separate. */
export type PreparedWebFile = {
  ticket: string;
  item_id: number;
  name: string;
  bytes: number;
  expires_in_seconds: number;
};
export type WebFileChunk = {
  offset: number;
  bytes: number;
  data_base64: string;
  eof: boolean;
};
export const nativeWebTransferSource = {
  prepare(shelfId: number, itemId: number): Promise<PreparedWebFile> {
    // UUID is a local correlation identifier, not a cloud login token.
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
