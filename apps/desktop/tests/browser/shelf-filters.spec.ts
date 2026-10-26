import { test,expect,type Page } from "@playwright/test";
import type { Item } from "../../src/backend";
import { mkdirSync } from "node:fs";
import path from "node:path";
const sample=(id:number,name:string,kind:string,tags:string[]=[],status="normal",shelf_id=1):Item=>({id,name,kind,tags,status,shelf_id,path:"SYNTHETIC/"+name,bytes:10,modified:1});
const items=[sample(1,"Alpha.txt","txt",["精选","设计"]),sample(2,"中文.png","png",["设计"]),sample(3,"失效素材.png","file",["归档"],"missing"),sample(4,"不可读.txt","file",[],"unreadable"),sample(5,"参考.webp","webp",["精选","空 格"]),sample(6,"资料夹","folder"),sample(7,"另一架.txt","txt",["另一架标签"],"normal",2),sample(8,"链接","link",[],"unsupported")];
async function setup(page:Page){
  await page.setViewportSize({width:420,height:520});
  await page.addInitScript(items=>{
    if(!localStorage.getItem("test-state"))localStorage.setItem("test-state",JSON.stringify({shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},{id:2,name:"本次中转",kind:"session",root:null,available:true}],items,jobs:[]}));
    if(!localStorage.getItem("ningmao-shelf-views"))localStorage.setItem("ningmao-shelf-views",JSON.stringify({version:2,shelves:{"1":{list:true,sort:"manual",size:80}}}));
  },items);
  await page.goto("/tests/harness.html");await expect(page.locator("[data-item-id]")).toHaveCount(7);
}
async function openFilters(page:Page){await page.getByRole("button",{name:"更多操作",exact:true}).click();await expect(page.getByRole("menuitem",{name:"筛选文件",exact:true})).toBeVisible({timeout:3000});await page.getByRole("menuitem",{name:"筛选文件",exact:true}).click();return page.getByRole("dialog",{name:"筛选文件",exact:true});}
async function order(page:Page){return page.locator("[data-item-id]").evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute("data-item-id"))));}
async function capture(page:Page,name:string){const dir=process.env.FILTER_EVIDENCE;if(dir){mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+".png")});}}

test("被搜索隐藏的旧选中项不能被空格预览或Delete移除",async({page})=>{
  await setup(page);await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();
  await page.keyboard.press("Control+f");await page.getByRole("textbox",{name:"搜索文件",exact:true}).fill("没有匹配记录");
  await page.getByRole("heading",{name:"没有匹配的文件",exact:true}).click();await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toHaveCount(0);await page.keyboard.press("Delete");
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  expect((await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!).items)).length).toBe(items.length);
});

test("类型、标签、状态和名称取交集，清除后记录与手动顺序不变",async({page})=>{
  await setup(page);const original=await page.evaluate(()=>localStorage.getItem("test-state"));
  const dialog=await openFilters(page);
  expect(await dialog.getByRole("combobox",{name:"标签",exact:true}).locator("option").allTextContents()).not.toContain("另一架标签");
  await dialog.getByRole("combobox",{name:"文件类型",exact:true}).selectOption("png");await dialog.getByRole("combobox",{name:"标签",exact:true}).selectOption("设计");await dialog.getByRole("combobox",{name:"文件状态",exact:true}).selectOption("normal");
  await dialog.getByRole("button",{name:"查看结果",exact:true}).click();await expect.poll(()=>order(page)).toEqual([2]);
  await expect(page.locator(".drag-handle:enabled")).toHaveCount(0);await expect(page.getByRole("button",{name:"清除筛选",exact:true})).toBeVisible();
  await page.keyboard.press("Control+f");const query=page.getByRole("textbox",{name:"搜索文件",exact:true});await query.fill("Alpha");await expect(page.getByRole("heading",{name:"没有匹配的文件",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"清除筛选和搜索",exact:true}).click();await expect.poll(()=>order(page)).toEqual([1,2,3,4,5,6,8]);
  await expect(page.locator(".drag-handle:enabled")).toHaveCount(7);expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(original);
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
});

test("异常引用保留，筛选隐藏的选择没有动作，切架和重载清除临时条件",async({page})=>{
  await setup(page);await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();
  let dialog=await openFilters(page);await dialog.getByRole("combobox",{name:"文件状态",exact:true}).selectOption("issues");await dialog.getByRole("button",{name:"查看结果",exact:true}).click();
  await expect.poll(()=>order(page)).toEqual([3,4,8]);await expect(page.getByRole("button",{name:"详情",exact:true})).toHaveCount(0);
  await page.locator(".explorer-pane").click({position:{x:5,y:5}});await page.keyboard.press("Space");await expect(page.getByRole("dialog")).toHaveCount(0);await page.keyboard.press("Delete");expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name:"本次中转",exact:true}).click();await expect.poll(()=>order(page)).toEqual([7]);
  dialog=await openFilters(page);await expect(dialog.getByRole("combobox",{name:"文件状态",exact:true})).toHaveValue("");await expect(dialog.getByRole("combobox",{name:"标签",exact:true}).locator("option")).toHaveCount(2);
  await dialog.getByRole("combobox",{name:"标签",exact:true}).selectOption("另一架标签");await dialog.getByRole("button",{name:"查看结果",exact:true}).click();await page.reload();await expect.poll(()=>order(page)).toEqual([7]);await expect(page.getByRole("button",{name:"清除筛选",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name:"灵感收集",exact:true}).click();await expect.poll(()=>order(page)).toEqual([1,2,3,4,5,6,8]);
});

test("刷新后已选标签消失仍显示原条件，无结果可明确清除",async({page})=>{
  await setup(page);let dialog=await openFilters(page);await dialog.getByRole("combobox",{name:"标签",exact:true}).selectOption("归档");await dialog.getByRole("button",{name:"查看结果",exact:true}).click();await expect.poll(()=>order(page)).toEqual([3]);
  await page.evaluate(()=>window.testHarness.tags(3,[]));
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"刷新文件状态",exact:true}).click();await expect(page.getByRole("heading",{name:"没有匹配的文件",exact:true})).toBeVisible();
  dialog=await openFilters(page);await expect(dialog.getByRole("combobox",{name:"标签",exact:true})).toHaveValue("归档");await expect(dialog.getByRole("combobox",{name:"标签",exact:true}).locator('option:checked')).toHaveText("归档");
  await dialog.getByRole("button",{name:"重置筛选",exact:true}).click();await expect(dialog.getByRole("combobox",{name:"标签",exact:true})).toHaveValue("");await dialog.getByRole("button",{name:"查看结果",exact:true}).click();await expect.poll(()=>order(page)).toEqual([1,2,3,4,5,6,8]);
});

for(const [width,height,theme] of [[340,320,"light"],[420,520,"dark"],[640,720,"light"]] as const){
  test(`${width}×${height} ${theme} 筛选抽屉可滚动、键盘退出，活动提示不遮挡语义`,async({page})=>{
    await setup(page);await page.setViewportSize({width,height});
    if(theme==="light"){await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"切换浅色主题",exact:true}).click();}
    const dialog=await openFilters(page);const type=dialog.getByRole("combobox",{name:"文件类型",exact:true});await type.selectOption("txt");await type.focus();
    await expect.poll(async()=>{const box=await dialog.boundingBox();return !!box && box.x>=0 && box.x+box.width<=width+1;}).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await capture(page,`drawer-${width}-${theme}`);
    const results=dialog.getByRole("button",{name:"查看结果",exact:true});await results.focus();await expect(results).toBeInViewport();
    await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
    await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();
    await expect(page.getByRole("button",{name:"清除筛选",exact:true})).toBeVisible();await expect(page.getByText("仅保存引用",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"拖出复制",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,`active-${width}-${theme}`);
  });
}
