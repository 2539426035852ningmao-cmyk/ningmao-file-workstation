import test from "node:test";
import assert from "node:assert/strict";
import {addDistinct, queueReview, visibleQueue, safeFileName, MAX_BROWSER_TRANSFER_BYTES, MAX_BROWSER_TRANSFER_FILES} from "../src/file-preparation.mjs";

const file = (name, size, lastModified=1) => ({name,size,lastModified});
const fake = (name,size,id) => ({id,file:file(name,size)});
test("accepted filenames exclude traversal, Windows devices and control characters", () => {
  for (const name of ["../test.txt","a\\b.txt","con","COM1.mp4","trailing.","bad\u0000name",""]) {
    assert.equal(safeFileName(name),false,name);
  }
  assert.equal(safeFileName("镜头 01.mov"),true);
  assert.equal(safeFileName("中".repeat(66)),true);
  assert.equal(safeFileName("中".repeat(67)),false);
});
test("duplicate additions are idempotent and reject invalid names", () => {
  const existing=[fake("合成.txt",12,"existing")];
  const result=addDistinct(existing,[file("合成.txt",12),file("next.jpg",5),file("../escape",2),file("next.jpg",5)],()=>"new");
  assert.equal(result.added,1);
  assert.equal(result.duplicates,2);
  assert.equal(result.invalid,1);
  assert.equal(result.items.length,2);
  assert.equal(existing.length,1);
});
test("W2 preview size and file-count warnings cannot be mistaken for finished transfer", () => {
  const entries=Array.from({length:MAX_BROWSER_TRANSFER_FILES+1},(_,i)=>fake("file"+i+".txt",i===0?MAX_BROWSER_TRANSFER_BYTES+1:1,String(i)));
  const report=queueReview(entries);
  assert.equal(report.oversizedIds.length,1);
  assert.equal(report.excessCount,1);
  assert.equal(report.count,17);
  assert.equal(report.bytes,MAX_BROWSER_TRANSFER_BYTES+17);
});
test("file filtering and sorting preserve original queue", () => {
  const entries=[fake("Zeta.MP4",10,"a"),fake("alpha.txt",50,"b"),fake("瀑布.jpg",20,"c")];
  assert.deepEqual(visibleQueue(entries,"","image","added").map(x=>x.id),["c"]);
  assert.deepEqual(visibleQueue(entries,"ALPHA","all","added").map(x=>x.id),["b"]);
  assert.deepEqual(visibleQueue(entries,"","all","size").map(x=>x.id),["b","c","a"]);
  assert.deepEqual(entries.map(x=>x.id),["a","b","c"]);
});
