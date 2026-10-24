import { test,expect,type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test("正式与预览共享紧凑窗口契约",()=>{
  const base=JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json",import.meta.url),"utf8"));
  const preview=JSON.parse(readFileSync(new URL("../../src-tauri/tauri.preview.conf.json",import.meta.url),"utf8"));
  const window=base.app.windows[0];
  expect([window.width,window.height,window.minWidth,window.minHeight]).toEqual([420,520,340,320]);
  expect(preview.app?.windows).toBeUndefined();expect(window.dragDropEnabled).toBe(true);
});
async function ready(page:Page){await page.goto("/tests/harness.html");await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();}
async function begin(page:Page,name="Alpha.txt"){
  const item=page.getByRole("button",{name:`选择 ${name}`,exact:true});const box=await item.boundingBox();if(!box)throw Error("missing item");
  const point={x:box.x+box.width/2,y:box.y+box.height/2};await page.mouse.move(point.x,point.y);await page.mouse.down();return point;
}
test("卡片越过阈值只请求一次原生拖出，点击/双击和手动顺序保持",async({page})=>{
  await ready(page);const original=await page.evaluate(()=>localStorage.getItem("test-state"));
  const point=await begin(page);await page.mouse.move(point.x+2,point.y+2);expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  await page.mouse.move(point.x+20,point.y,{steps:4});await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toEqual(["drag:1"]);
  await page.mouse.move(point.x+40,point.y+10,{steps:5});await page.mouse.up();expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(["drag:1"]);
  expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(original);
  await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).dblclick();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toEqual(["drag:1","open:1"]);
});
test("手柄仍仅排序，原生文件拖入仍走既有引用路由",async({page})=>{
  await ready(page);const source=page.locator('[data-item-id="1"]'),target=page.locator('[data-item-id="3"]');await source.hover();
  const handle=await source.getByRole("button",{name:"调整 Alpha.txt 顺序",exact:true}).boundingBox(),to=await target.boundingBox();if(!handle||!to)throw Error("missing handles");
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:18});await expect(page.getByTestId("drag-preview")).toBeVisible();await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toEqual(["reorder:1"]);
  await page.evaluate(()=>window.testHarness.drop(["SYNTHETIC/中文 流转.txt"]));await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toEqual(["reorder:1","import:1:1"]);
});
test("取消、异常引用和拖出请求失败均不改变来源记录",async({page})=>{
  await ready(page);const original=await page.evaluate(()=>localStorage.getItem("test-state"));
  let point=await begin(page);await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).dispatchEvent("pointercancel",{pointerType:"mouse",pointerId:1});await page.mouse.move(point.x+20,point.y);await page.mouse.up();expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  await page.evaluate(()=>window.testHarness.missing(1));await page.reload();await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();point=await begin(page);await page.mouse.move(point.x+20,point.y);await page.mouse.up();expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  await page.evaluate(original=>{if(original===null)localStorage.removeItem("test-state");else localStorage.setItem("test-state",original);},original);await page.reload();await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await page.evaluate(()=>window.testHarness.fail("合成拖出失败"));point=await begin(page);await page.mouse.move(point.x+20,point.y);await page.mouse.up();await expect(page.getByRole("alert")).toContainText("合成拖出失败");
  expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(original);
});
