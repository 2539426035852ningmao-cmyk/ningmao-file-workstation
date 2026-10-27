import {test,expect,type Page} from "@playwright/test";
import {mkdirSync} from "node:fs";
import path from "node:path";
const sample=(id:number,name:string,shelf_id:number,kind="txt",tags:string[]=[],status="normal")=>({id,name,shelf_id,kind,tags,status,path:"SYNTHETIC/private/"+name,bytes:10,modified:1});
const items=[sample(1,"Alpha.txt",1),sample(2,"角色 Design.png",1,"png",["收藏"]),sample(3,"角色 Design.png",2,"png"),sample(4,"角色 offline.txt",2,"txt",[],"missing"),...Array.from({length:90},(_,i)=>sample(i+10,`Filler ${i}.txt`,2)),sample(200,"Zebra.txt",2)];
async function setup(page:Page,query=""){
  await page.setViewportSize({width:420,height:520});
  await page.addInitScript(items=>{localStorage.setItem("test-state",JSON.stringify({shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},{id:2,name:"项目参考",kind:"persistent",root:null,available:true}],items,jobs:[]}));},items);
  await page.goto("/tests/harness.html"+query);await expect(query.includes("manager")?page.getByRole("heading",{name:"总览",exact:true}):page.getByRole("button",{name:"更多操作",exact:true})).toBeVisible();
  await page.keyboard.press("Control+k");return page.getByRole("dialog",{name:query.includes("shelf=")?"搜索当前文件架":"跨文件架搜索",exact:true});
}
test("类别、架类型和失效状态可以单独或组合筛选",async({page})=>{
  const dialog=await setup(page),results=dialog.getByRole("listbox").getByRole("option");
  await dialog.getByRole("combobox",{name:"搜索类型"}).selectOption("image");
  await expect(results).toHaveCount(1);await expect(results.first()).toContainText("角色 Design.png");
  await dialog.getByRole("combobox",{name:"搜索类型"}).selectOption("all");
  await dialog.getByRole("combobox",{name:"文件架类型"}).selectOption("persistent");
  await dialog.getByRole("combobox",{name:"文件状态"}).selectOption("missing");
  await expect(results).toHaveCount(1);await expect(results.first()).toContainText("角色 offline.txt");
  await dialog.getByRole("combobox",{name:"文件架类型"}).selectOption("bound");
  await expect(dialog.getByText("没有匹配的文件",{exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await expect(dialog.getByRole("combobox",{name:"文件状态"})).toHaveValue("all");
});
test("中文英文、标签及类型搜索聚合同文件引用，不暴露路径，键盘关闭",async({page})=>{
  const dialog=await setup(page),input=dialog.getByRole("textbox",{name:"名称或标签"});await input.fill("角色");
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(2);await expect(dialog.getByText("2 处引用",{exact:true})).toBeVisible();await expect(dialog.getByText(/TXT · 引用失效/)).toBeVisible();
  expect(await dialog.innerHTML()).not.toContain("SYNTHETIC/private");
  await input.fill("收藏");await dialog.getByRole("combobox",{name:"搜索类型"}).selectOption("png");await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);await expect(dialog.getByText(/标签匹配/)).toBeVisible();
  await input.fill("DESIGN");await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await page.evaluate(()=>document.documentElement.className="light");await expect(dialog).toHaveCSS("background-color","rgb(255, 255, 255)");
  const dir=process.env.SEARCH_EVIDENCE;if(dir){mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,"search-light.png")});}
  await page.evaluate(()=>document.documentElement.className="dark");await expect(dialog).toHaveCSS("background-color","rgb(25, 27, 32)");if(dir)await page.screenshot({path:path.join(dir,"search-dark.png")});
  await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);expect((await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!).items)).length).toBe(items.length);
});
test("定位跨架结果清除旧过滤并滚动到目标，Ctrl F 保持可用",async({page})=>{
  const dialog=await setup(page);await dialog.getByRole("textbox",{name:"名称或标签"}).fill("ZEBRA");await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);await expect(page.locator('[data-item-id="200"]')).toBeVisible();await expect(page.getByRole("button",{name:"选择 Zebra.txt",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.keyboard.press("Control+f");await page.getByRole("textbox",{name:"搜索文件",exact:true}).fill("Zebra");await expect(page.locator("[data-item-id]")).toHaveCount(1);
  expect(await page.evaluate(()=>window.testHarness.calls())).toContain("search-focus:2:200");
});
test("独立文件架查询受限，失败保留查询且可重试，旧响应不能覆盖新查询",async({page})=>{
  const dialog=await setup(page,"?shelf=1&search-delay=1"),input=dialog.getByRole("textbox",{name:"名称或标签"});await input.fill("offline");await expect(dialog.getByText("没有匹配的文件",{exact:true})).toBeVisible();
  await page.evaluate(()=>window.testHarness.fail("SYNTHETIC/private/do-not-leak"));await input.fill("Alpha");await expect(dialog.getByRole("alert")).toHaveText("搜索暂时不可用，请重试。");await expect(input).toHaveValue("Alpha");expect(await dialog.innerHTML()).not.toContain("do-not-leak");
  await dialog.getByRole("button",{name:"重试搜索"}).click();await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await input.fill("slow");await expect.poll(()=>page.evaluate(()=>window.testHarness.calls().includes("search:slow"))).toBe(true);await input.fill("DESIGN");await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);await expect(dialog.getByRole("listbox").getByRole("option")).toContainText("角色 Design.png");
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls().includes("search-done:slow"))).toBe(true);await expect(dialog.getByRole("listbox").getByRole("option")).toContainText("角色 Design.png");
});
test("管理中心共用搜索，最小窗口与减少动态效果下仍能键盘使用",async({page})=>{
  const dialog=await setup(page,"?manager");await page.setViewportSize({width:340,height:320});await page.emulateMedia({reducedMotion:"reduce"});
  await dialog.getByRole("textbox",{name:"名称或标签"}).fill("offline");await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);
  const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(340);expect(box!.y+box!.height).toBeLessThanOrEqual(320);
  const dir=process.env.SEARCH_EVIDENCE;if(dir){mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,"search-minimum.png")});}
  await page.keyboard.press("Enter");await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>window.testHarness.calls())).toContain("search-focus:2:4");
});
