import {describe,expect,it} from "vitest";
import {MAX_BYTES,safeFileName as webSafeName} from "../src/guards";
import {safeFileName as queueSafeName,MAX_BROWSER_TRANSFER_BYTES} from "../src/file-preparation.mjs";
import {safeWebFileName as windowsSafeName,WEB_MAX_FILE_BYTES,WEB_CHUNK_BYTES} from "../../desktop/src/webFileRules";

/** W2 browser offers, W0 preparation and W3 Tauri source/sink must agree.
 * Native Rust mirrors these caps; Windows Rust unit tests assert actual copy behavior.
 */
describe("W2 ↔ W3 Web and Windows contract",()=>{
  it("agrees on the 64MiB envelope and bounded 64KiB chunk size",()=>{
    expect(MAX_BYTES).toBe(64*1024*1024);
    expect(MAX_BROWSER_TRANSFER_BYTES).toBe(MAX_BYTES);
    expect(WEB_MAX_FILE_BYTES).toBe(MAX_BYTES);
    expect(WEB_CHUNK_BYTES).toBe(64*1024);
  });
  it("matches every filename verdict including multi-byte and Windows reserved names",()=>{
    const candidates=[
      "分镜 01.mp4","shot-001.webp","中国场景.mov","a.txt","中".repeat(66),
      "",".","..","CON","CON.txt","LPT1.log","aux.md","...","../a.txt",
      "x\\target.txt","C:ads.txt","bad\u0000name","bad\nname","hello|world.txt",
      "trailing.","trailing ","中".repeat(67),"a".repeat(201)
    ];
    for(const name of candidates){
      const web=webSafeName(name);
      expect(windowsSafeName(name),"Windows diverged for "+JSON.stringify(name)).toBe(web);
      expect(queueSafeName(name),"UI diverged for "+JSON.stringify(name)).toBe(web);
    }
  });
});
