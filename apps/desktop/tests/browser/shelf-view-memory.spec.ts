import { test,expect,type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
const key="ningmao-shelf-views";
const evidence=process.env.VIEW_MEMORY_EVIDENCE;
async function capture(page:Page,name:string){if(evidence){mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+".png")});}}
async function choose(page:Page,name:string){await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitemradio",{name,exact:true}).click();}
async function shelf(page:Page,name:string){await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name,exact:true}).click();}
async function checked(page:Page,names:string[],shot?:string){await page.getByRole("button",{name:"更多操作",exact:true}).click();for(const name of names)await expect(page.getByRole("menuitemradio",{name,exact:true})).toHaveAttribute("aria-checked","true");if(shot)await capture(page,shot);await page.keyboard.press("Escape");}

test("每架独立记住视图、缩略图和排序，重载后手动顺序不丢失",async({page})=>{
  await page.setViewportSize({width:420,height:520});
  await page.goto("/tests/harness.html");
  await choose(page,"详细列表");await choose(page,"大缩略图");await choose(page,"名称排序");
  await shelf(page,"本次中转");await checked(page,["网格视图","中缩略图","手动顺序"]);
  await choose(page,"小缩略图");
  await shelf(page,"灵感收集");await checked(page,["详细列表","大缩略图","名称排序"]);
  await expect(page.locator(".asset-row").first()).toBeVisible();
  await page.reload();await checked(page,["详细列表","大缩略图","名称排序"],"restored-view");
  await choose(page,"手动顺序");
  expect(await page.locator("[data-item-id]").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-item-id")))).toEqual(["1","2","3"]);
  expect(await page.evaluate(()=>window.testHarness.calls())).not.toContain("reorder:1");
  await shelf(page,"本次中转");await checked(page,["网格视图","小缩略图","手动顺序"]);
});

for(const raw of ["{broken",'{"version":1,"shelves":{"1":{"list":"bad","sort":["name"],"size":999},"2":{"list":true,"sort":"name","size":60},"__proto__":{"polluted":true}}}']){
  test(`损坏视图设置回退并保留有效架设置：${raw==="{broken"?"无效JSON":"部分无效"}`,async({page})=>{
    await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
    await page.goto("/tests/harness.html");await expect(page.getByRole("alert")).toContainText("已使用默认");
    await checked(page,["网格视图","中缩略图","手动顺序"]);
    expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(raw);
    await choose(page,"大缩略图");await expect(page.getByRole("alert")).toHaveCount(0);
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
    expect(saved.shelves["1"]).toEqual({list:false,sort:"manual",size:120});
    expect(Object.keys(saved.shelves)).not.toContain("__proto__");
    if(raw!=="{broken")expect(saved.shelves["2"]).toEqual({list:true,sort:"name",size:60});
    expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  });
}

test("更高版本设置可临时调整但绝不自动降级覆盖",async({page})=>{
  const raw=JSON.stringify({version:2,shelves:{"1":{future:"preserve"}}});
  await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
  await page.goto("/tests/harness.html");await expect(page.getByRole("alert")).toContainText("原设置保留");
  await choose(page,"详细列表");await expect(page.locator(".asset-row").first()).toBeVisible();
  await choose(page,"大缩略图");await checked(page,["详细列表","大缩略图","手动顺序"]);
  await expect(page.getByRole("alert")).toContainText("仅临时生效");
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(raw);
});

test("超大设置保留原文，临时调整不覆盖",async({page})=>{
  const raw="X".repeat(100_001);
  await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
  await page.goto("/tests/harness.html");await expect(page.getByRole("alert")).toContainText("视图记忆过大");
  await choose(page,"详细列表");await checked(page,["详细列表","手动顺序","中缩略图"]);
  expect((await page.evaluate(key=>localStorage.getItem(key),key))===raw).toBe(true);
});

test("设置存储读写被禁用时不白屏，显示和主题仍可临时切换",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const read=Storage.prototype.getItem,write=Storage.prototype.setItem;
    Storage.prototype.getItem=function(key){if(key.startsWith("ningmao-"))throw new DOMException("synthetic denied","SecurityError");return read.call(this,key);};
    Storage.prototype.setItem=function(key,value){if(key.startsWith("ningmao-"))throw new DOMException("synthetic denied","SecurityError");return write.call(this,key,value);};
  });
  await page.goto("/tests/harness.html");await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("已使用默认");
  await choose(page,"详细列表");await expect(page.locator(".asset-row").first()).toBeVisible();await expect(page.getByRole("alert")).toContainText("无法保存设置");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"切换浅色主题",exact:true}).click();
  await expect(page.locator("html")).toHaveClass("light");
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);expect(errors).toEqual([]);
});

test("写入配额失败保留内存显示和原设置，恢复后下一次调整可保存",async({page})=>{
  await page.setViewportSize({width:420,height:520});
  await page.addInitScript(()=>{
    const write=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==="ningmao-shelf-views")throw new DOMException("synthetic full","QuotaExceededError");return write.call(this,key,value);};
    Object.defineProperty(window,"allowViewWrites",{value:()=>{Storage.prototype.setItem=write;}});
  });
  await page.goto("/tests/harness.html");
  const records=await page.evaluate(()=>localStorage.getItem("test-state"));
  await choose(page,"详细列表");await expect(page.locator(".asset-row").first()).toBeVisible();await expect(page.getByRole("alert")).toContainText("无法保存设置");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,"save-failed");
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
  await page.evaluate(()=>(window as unknown as {allowViewWrites:()=>void}).allowViewWrites());
  await choose(page,"名称排序");await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).shelves["1"],key)).toEqual({list:true,sort:"name",size:80});
  expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(records);
  await page.reload();await checked(page,["详细列表","名称排序","中缩略图"]);
});
