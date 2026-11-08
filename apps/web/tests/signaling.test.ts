import { describe, expect, it } from "vitest";
import { isClientSignal, sameSession } from "../src/signaling";
const to = "11a65d50-d0b6-461c-b8a2-8f6cf77fa453";
const id = "df38bcb1-3eba-4796-b893-b93332157a7a";
const base = { to, payload: { id } };
describe("W2 scoped signaling", () => {
  it("rejects stale cancellation or SDP from another task or device", () => {
    const active = { id, to };
    expect(sameSession(active, to, { id })).toBe(true);
    expect(sameSession(active, to, { id: "b47a6d02-986c-4d8d-a0be-6cd42d2e422a" })).toBe(false);
    expect(sameSession(active, "b47a6d02-986c-4d8d-a0be-6cd42d2e422a", { id })).toBe(false);
    expect(sameSession(null, to, { id })).toBe(false);
  });
  it("accepts a bounded ping", () => expect(isClientSignal({ type: "ping" })).toBe(true));
  it("rejects unexpected packet types", () => expect(isClientSignal({ ...base, type: "read-file" })).toBe(false));
  it("requires a transfer id and exact device id", () => {
    expect(isClientSignal({ type: "cancel", to: "bad", payload: { id } })).toBe(false);
    expect(isClientSignal({ type: "cancel", to, payload: {} })).toBe(false);
  });
  it("rejects an invalid receipt", () => expect(isClientSignal({ ...base, type: "receipt", payload: { id, ok: false } })).toBe(false));
  it("accepts and limits session descriptions", () => {
    expect(isClientSignal({ ...base, type: "description", payload: { id, description: { type: "offer", sdp: "v=0" } } })).toBe(true);
    expect(isClientSignal({ ...base, type: "description", payload: { id, description: { type: "offer", sdp: "a".repeat(12_001) } } })).toBe(false);
  });
  it("accepts ICE candidate and rejects oversized candidate", () => {
    expect(isClientSignal({ ...base, type: "candidate", payload: { id, candidate: { candidate: "candidate:1" } } })).toBe(true);
    expect(isClientSignal({ ...base, type: "candidate", payload: { id, candidate: { candidate: "x".repeat(4001) } } })).toBe(false);
  });
  it("accepts a valid invite but rejects oversized file", () => {
    const invite = { id, name: "合成.txt", size: 100, mime: "text/plain", sha256: "a".repeat(64) };
    expect(isClientSignal({ type: "invite", to, payload: invite })).toBe(true);
    expect(isClientSignal({ type: "invite", to, payload: { ...invite, size: 70 * 1024 * 1024 } })).toBe(false);
  });
});
