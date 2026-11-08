import test from "node:test";
import assert from "node:assert/strict";
import {classifyFile, formatBytes, totalSize} from "../src/file-utils.mjs";

test("friendly byte sizes and invalid input", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.00 KB");
  assert.equal(formatBytes(1048576), "1.00 MB");
  assert.equal(formatBytes(-1), "—");
});
test("file classification is case insensitive", () => {
  assert.equal(classifyFile("shot.MP4"), "video");
  assert.equal(classifyFile("poster.webp"), "image");
  assert.equal(classifyFile("bundle.zip"), "archive");
  assert.equal(classifyFile("notes.txt"), "document");
});
test("total size", () => {
  assert.equal(totalSize([{size:4},{size:7}]), 11);
});
