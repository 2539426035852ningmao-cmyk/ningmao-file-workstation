import test from "node:test";
import assert from "node:assert/strict";
import { createAssets, filterAssets, reorder, thumbnail } from "../src/model.ts";

test("同一素材可重建，排序和过滤不改动原始集合", () => {
  const files = createAssets(2000);
  assert.equal(files.length, 2000);
  assert.equal(new Set(files.map(f => f.id)).size, 2000);
  assert.deepEqual(files, createAssets(2000));
  const original = files.map(f => f.id);
  const moved = reorder(original, original[0], original[2]);
  assert.deepEqual(moved.slice(0, 3), [original[1], original[2], original[0]]);
  assert.deepEqual(files.map(f => f.id), original);
  assert.deepEqual(reorder(original, "missing", original[2]), original);
  assert.ok(filterAssets(files, "封面", "all").every(f => f.name.includes("封面")));
  assert.equal(filterAssets(files, "不可能存在的素材词", "all").length, 0);
  assert.ok(filterAssets(files, "", "待整理").every(f => f.group === "待整理"));
  assert.match(thumbnail(0), /^data:image\/svg\+xml/);
});
