import { validInvite } from "./guards";

/** Shared, runtime-validated protocol. No filesystem paths, credentials or file bytes. */
export const PROTOCOL_VERSION = 1;
export const MAX_SIGNAL_BYTES = 16_384;
export const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TASK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Dict = Record<string, unknown>;
export type ClientSignal = {
  type: "invite" | "decision" | "description" | "candidate" | "receipt" | "cancel";
  to: string;
  payload: Dict & { id: string };
};
export type Ping = { type: "ping" };
export function isDict(v: unknown): v is Dict {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function isClientSignal(v: unknown): v is Ping | ClientSignal {
  if (!isDict(v) || typeof v.type !== "string") return false;
  if (v.type === "ping") return true;
  if (!DEVICE_ID_RE.test(String(v.to ?? "")) || !isDict(v.payload)) return false;
  const p = v.payload;
  if (!TASK_ID_RE.test(String(p.id ?? ""))) return false;
  switch (v.type) {
    case "invite":
      return validInvite(p);
    case "decision":
      return typeof p.accepted === "boolean";
    case "cancel":
      return true;
    case "receipt":
      return p.ok === true;
    case "description":
      return isDict(p.description) &&
        (p.description.type === "offer" || p.description.type === "answer") &&
        typeof p.description.sdp === "string" &&
        p.description.sdp.length <= 12_000;
    case "candidate":
      return isDict(p.candidate) &&
        typeof p.candidate.candidate === "string" &&
        p.candidate.candidate.length <= 4_000 &&
        (p.candidate.sdpMid === null || p.candidate.sdpMid === undefined || typeof p.candidate.sdpMid === "string") &&
        (p.candidate.sdpMLineIndex === null || p.candidate.sdpMLineIndex === undefined ||
          (typeof p.candidate.sdpMLineIndex === "number" && Number.isInteger(p.candidate.sdpMLineIndex)));
    default:
      return false;
  }
}

export function sameSession(
  active: { id: string; to: string } | null,
  from: string,
  payload: unknown
): boolean {
  return !!active && active.to === from && isDict(payload) && payload.id === active.id;
}
