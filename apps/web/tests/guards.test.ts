import { describe, expect, it } from "vitest";
import { MAX_BYTES, validInvite, readable, safeFileName } from "../src/guards";

const good = { id: "b47a6d02-986c-4d8d-a0be-6cd42d2e422a", name: "中文文件.png", size: 1024, mime: "image/png", sha256: "f".repeat(64) };
describe("untrusted transfer metadata", () => {
  it("accepts normal metadata", () => expect(validInvite(good)).toBe(true));
  it("rejects over-limit files", () => expect(validInvite({ ...good, size: MAX_BYTES + 1 })).toBe(false));
  it("rejects negative sizes and oversized names", () => {
    expect(validInvite({ ...good, size: -1 })).toBe(false);
    expect(validInvite({ ...good, name: "x".repeat(201) })).toBe(false);
  });
  it("rejects malformed digests and ids", () => {
    expect(validInvite({ ...good, sha256: "fake" })).toBe(false);
    expect(validInvite({ ...good, id: "invalid" })).toBe(false);
  });
  it("rejects traversal, NUL and Windows reserved device file names", () => {
    for (const name of ["../outside.txt", "..\\outside.txt", "bad\\u0000name.txt", "CON.txt", "LPT1", "trailing."]) {
      expect(safeFileName(name)).toBe(false);
      expect(validInvite({ ...good, name })).toBe(false);
    }
    expect(safeFileName("合成素材 01.mp4")).toBe(true);
  });
  it("formats bytes", () => expect(readable(1048576)).toBe("1.0 MB"));
});
