import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import path from "node:path";
async function capture(page:import("@playwright/test").Page,name:string){const folder=process.env.DETACHED_EVIDENCE;if(folder){mkdirSync(folder,{recursive:true});await page.screenshot({path:path.join(folder,name+".png")});}}
async function more(page:import("@playwright/test").Page,name:string){await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name,exact:true}).click();}

test("恢复窗口置顶标记时只读取所属窗口，不混用入口或其他架状态",async({page})=>{
  await page.addInitScript(()=>localStorage.setItem("test-desktop-layout",JSON.stringify({layout:{enabled:true,expanded:true,active_shelf:2,collapsed:[],page:0,main_topmost:true,preferences:{edge:"right",auto_hide:false,topmost:false},detached:[{shelf_id:1,visible:true,topmost:true}]},entries:[],total:0,warning:null,copying:false,edge_hidden:false})));
  for(const url of ["/tests/harness.html","/tests/harness.html?shelf=1"]){
    await page.goto(url);await expect(page.getByRole("status").last()).toContainText("文件架已恢复");
    await page.getByRole("button",{name:"更多操作",exact:true}).click();
    await expect(page.getByRole("menuitemcheckbox",{name:"窗口置顶",exact:true})).toBeChecked();
    await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem("test-desktop-layout")!);value.layout.main_topmost=false;value.layout.detached[0].topmost=false;value.layout.preferences.topmost=true;const updated=JSON.stringify(value);localStorage.setItem("test-desktop-layout",updated);window.dispatchEvent(new StorageEvent("storage",{key:"test-desktop-layout",newValue:updated}));});
    await expect(page.getByRole("menuitemcheckbox",{name:"窗口置顶",exact:true})).not.toBeChecked();
  }
});
test("文件架拆出后主窗切到其他架，独立窗合并保留引用和标签",async({page,context})=>{
  await page.goto("/tests/harness.html");await page.evaluate(()=>window.testHarness.tags(1,["拆合保留"]));
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  const detach=page.getByRole("menuitem",{name:"拆分为独立窗口",exact:true});await expect(detach).toBeVisible({timeout:3000});await detach.click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("detach:1");
  await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toContainText("本次中转");
  const shelf=await context.newPage();await shelf.goto("/tests/harness.html?shelf=1");await expect(shelf.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await shelf.setViewportSize({width:420,height:520});expect(await shelf.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(shelf,"independent-dark");
  await shelf.getByRole("button",{name:"更多操作",exact:true}).click();await shelf.getByRole("menuitem",{name:"合并回主窗口",exact:true}).click();await expect.poll(()=>shelf.evaluate(()=>window.testHarness.calls())).toContain("merge:1");
  await page.reload();await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toContainText("灵感收集");await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!).items.find((i:{id:number})=>i.id===1).tags)).toEqual(["拆合保留"]);
  await shelf.close();
});
test("全部拆出后空主窗仍可新建，拆合失败不丢引用或改变归属",async({page,context})=>{
  await page.goto("/tests/harness.html");
  await page.evaluate(()=>window.testHarness.fail("合成拆分失败"));
  await more(page,"拆分为独立窗口");
  await expect(page.getByRole("alert")).toContainText("合成拆分失败");
  await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await more(page,"拆分为独立窗口");await more(page,"拆分为独立窗口");
  await expect(page.getByRole("heading",{name:"主窗口暂无文件架"})).toBeVisible();
  await expect(page.getByRole("button",{name:"添加引用",exact:true})).toBeDisabled();
  await page.setViewportSize({width:340,height:320});await page.evaluate(()=>{localStorage.setItem("ningmao-theme","light");window.dispatchEvent(new StorageEvent("storage",{key:"ningmao-theme"}));});await expect(page.locator("html")).toHaveClass("light");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,"empty-main-light");
  await page.evaluate(()=>window.testHarness.drop(["SYNTHETIC/no-target.txt"]));
  await expect(page.getByRole("alert")).toContainText("请先新建文件架");
  expect(await page.evaluate(()=>window.testHarness.calls())).not.toContain("import:0:1");
  const own=await context.newPage();await own.goto("/tests/harness.html?shelf=1");
  await own.getByRole("button",{name:"切换文件架",exact:true}).click();
  await expect(own.getByRole("menuitem",{name:"新建文件架",exact:true})).toHaveCount(0);await own.keyboard.press("Escape");
  await own.evaluate(()=>window.testHarness.fail("合成合并失败"));await more(own,"合并回主窗口");
  await expect(own.getByRole("alert")).toContainText("合成合并失败");await expect(own.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitem",{name:"新建文件架",exact:true}).click();
  await page.getByRole("textbox",{name:"文件架名称"}).fill("新的主架");await page.getByRole("button",{name:"创建",exact:true}).click();
  await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toContainText("新的主架");
  await expect(own.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();await own.close();
});
test("独立窗仅显示自己的文件，可跨架复制引用，各窗视图不会互相覆盖",async({page,context})=>{
  await page.goto("/tests/harness.html");await more(page,"拆分为独立窗口");
  const own=await context.newPage();await own.goto("/tests/harness.html?shelf=1");
  await own.getByRole("button",{name:"更多操作",exact:true}).click();await own.getByRole("menuitemradio",{name:"详细列表",exact:true}).click();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitemradio",{name:"大缩略图",exact:true}).click();
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem("ningmao-shelf-views")!).shelves);
  expect(prefs["1"].list).toBe(true);expect(prefs["2"].size).toBe(120);
  await own.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();await more(own,"复制选中引用到其他架");
  await own.getByRole("combobox",{name:"目标文件架"}).selectOption("2");await own.getByRole("button",{name:"复制引用",exact:true}).click();
  await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await page.evaluate(()=>window.testHarness.drop(["SYNTHETIC/Only-main.txt"]));
  await expect(page.getByRole("button",{name:"选择 Only-main.txt",exact:true})).toBeVisible();
  await expect(own.getByRole("button",{name:"选择 Only-main.txt",exact:true})).toHaveCount(0);
  await more(own,"合并回主窗口");await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toContainText("灵感收集");
  await expect(page.locator(".asset-row").first()).toBeVisible();await page.reload();await expect(page.locator(".asset-row").first()).toBeVisible();await own.close();
});
