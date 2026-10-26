import { test,expect,type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
const evidence=process.env.SELECTION_EVIDENCE;
async function capture(page:Page,name:string){if(evidence){mkdirSync(evidence,{recursive:true});await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:path.join(evidence,name+".png")});}}
const file=(page:Page,name:string)=>page.getByRole("button",{name:`选择 ${name}`,exact:true});
const selected=(page:Page)=>page.locator('.asset-select[aria-pressed="true"]');
async function setup(page:Page){await page.setViewportSize({width:420,height:520});await page.goto("/tests/harness.html");await expect(file(page,"Alpha.txt")).toBeVisible();}
async function beginBox(page:Page){
  const a=await page.locator('[data-item-id="1"]').boundingBox(),b=await page.locator('[data-item-id="2"]').boundingBox();if(!a||!b)throw Error("missing cards");
  await page.mouse.move(a.x+2,a.y+a.height+30);await page.mouse.down();await page.mouse.move(b.x+b.width-2,a.y+5,{steps:12});
}
test("Ctrl切换、Shift范围、整组卡片拖出与普通单击遵守桌面选择习惯",async({page})=>{
  await setup(page);const original=await page.evaluate(()=>localStorage.getItem("test-state"));
  await file(page,"Alpha.txt").click();await file(page,"Gamma.txt").click({modifiers:["Control"]});await expect(selected(page)).toHaveCount(2);
  await file(page,"Gamma.txt").click({modifiers:["Control"]});await expect(selected(page)).toHaveCount(1);
  await file(page,"Alpha.txt").click();await file(page,"Gamma.txt").click({modifiers:["Shift"]});await expect(selected(page)).toHaveCount(3);
  await page.setViewportSize({width:340,height:320});await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"切换浅色主题",exact:true}).click();await expect(page.getByRole("button",{name:"拖出复制",exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,"group-340-light");await page.setViewportSize({width:420,height:520});
  const box=await file(page,"Alpha.txt").boundingBox();if(!box)throw Error("missing card");await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:5});
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toEqual(["drag:1,2,3"]);await page.mouse.up();await expect(selected(page)).toHaveCount(3);
  await file(page,"中文 文件.txt").click();await expect(selected(page)).toHaveCount(1);await expect(file(page,"中文 文件.txt")).toHaveAttribute("aria-pressed","true");
  expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(original);
});
test("从空白框选持续高亮、取消还原且不会触发原生拖出",async({page})=>{
  await setup(page);await beginBox(page);await expect(page.getByTestId("selection-marquee")).toBeVisible();await expect(selected(page)).toHaveCount(2);
  await capture(page,"marquee-420-dark");
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);await page.mouse.up();await expect(page.getByTestId("selection-marquee")).toHaveCount(0);await expect(selected(page)).toHaveCount(2);
  await beginBox(page);await page.keyboard.press("Escape");await page.mouse.up();await expect(selected(page)).toHaveCount(2);
  const area=await page.getByTestId("file-scroll").boundingBox();if(!area)throw Error("missing area");await page.mouse.click(area.x+5,area.y+area.height-15);await expect(selected(page)).toHaveCount(0);
});
test("多选汇总与移除只作用于可见引用，搜索输入的Ctrl+A不改变选择",async({page})=>{
  await setup(page);await file(page,"Alpha.txt").click();await file(page,"Gamma.txt").click({modifiers:["Control"]});
  await page.setViewportSize({width:640,height:720});await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"切换浅色主题",exact:true}).click();
  await page.getByRole("button",{name:"详情",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("已选 2 项");await expect(page.getByRole("dialog")).toContainText("400 B");await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"搜索文件",exact:true}).focus();await page.keyboard.press("Delete");expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  await file(page,"Gamma.txt").focus();await page.keyboard.press("Delete");await expect(page.locator('[data-item-id]')).toHaveCount(1);expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(["remove:1","remove:3"]);
  await file(page,"中文 文件.txt").click();await page.keyboard.press("Control+f");const input=page.getByRole("textbox",{name:"搜索文件",exact:true});await input.fill("中文");await input.press("Control+a");await expect(selected(page)).toHaveCount(1);
});
test("虚拟列表Shift跨未挂载项连选，批量拖出超64项明确拒绝且不截断",async({page})=>{
  await setup(page);await page.evaluate(()=>window.testHarness.drop(Array.from({length:80},(_,i)=>`SYNTHETIC/素材${i}.txt`)));await file(page,"Alpha.txt").click();
  const scroll=page.getByTestId("file-scroll");await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(file(page,"素材79.txt")).toBeVisible();await file(page,"素材79.txt").click({modifiers:["Shift"]});
  await expect(page.getByLabel("已选数量",{exact:true})).toHaveText("83 项");expect(await page.locator('[data-item-id]').count()).toBeLessThan(30);
  const box=await file(page,"素材79.txt").boundingBox();if(!box)throw Error("missing last card");await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-20,box.y+box.height/2,{steps:5});await page.mouse.up();
  await expect(page.getByRole("alert")).toContainText("64");expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(["import:1:80"]);
  await page.keyboard.press("Control+a");await expect(page.getByLabel("已选数量",{exact:true})).toHaveText("83 项");await page.keyboard.press("Escape");await expect(selected(page)).toHaveCount(0);
});
test("搜索隐藏的选中项不会被批量拖出或Delete，Shift按当前显示顺序",async({page})=>{
  await setup(page);await file(page,"Alpha.txt").click();await file(page,"Gamma.txt").click({modifiers:["Control"]});
  await page.keyboard.press("Control+f");await page.getByRole("textbox",{name:"搜索文件",exact:true}).fill("Alpha");await file(page,"Alpha.txt").focus();await page.keyboard.press("Delete");
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(["remove:1"]);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!).items.map((i:{id:number})=>i.id))).toEqual([2,3]);
  await page.getByRole("textbox",{name:"搜索文件",exact:true}).press("Escape");await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitemradio",{name:"名称排序",exact:true}).click();
  await file(page,"Gamma.txt").click();await file(page,"中文 文件.txt").click({modifiers:["Shift"]});await expect(selected(page)).toHaveCount(2);
  const card=await file(page,"Gamma.txt").boundingBox();if(!card)throw Error("missing card");await page.mouse.move(card.x+30,card.y+30);await page.mouse.down();await page.mouse.move(card.x+50,card.y+30,{steps:5});await page.mouse.up();
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(["remove:1","drag:2,3"]);
});
test("Ctrl框选叠加/取消选择，虚拟列表框选在边缘连续滚动",async({page})=>{
  await setup(page);await file(page,"Gamma.txt").click();await page.keyboard.down("Control");await beginBox(page);await page.mouse.up();await page.keyboard.up("Control");await expect(selected(page)).toHaveCount(3);
  await page.keyboard.down("Control");await beginBox(page);await page.mouse.up();await page.keyboard.up("Control");await expect(selected(page)).toHaveCount(1);await expect(file(page,"Gamma.txt")).toHaveAttribute("aria-pressed","true");
  await page.evaluate(()=>window.testHarness.drop(Array.from({length:60},(_,i)=>`SYNTHETIC/滚动${i}.txt`)));
  // drop dispatches an async import; changing items cancels an in-flight marquee.
  await expect(file(page,"滚动0.txt")).toBeVisible();await expect(page.getByRole("button",{name:"添加引用",exact:true})).toBeEnabled();
  const area=await page.getByTestId("file-scroll").boundingBox();if(!area)throw Error("missing area");await page.mouse.move(area.x+2,area.y+20);await page.mouse.down();await page.mouse.move(area.x+area.width-12,area.y+area.height-4,{steps:12});
  await expect(page.getByTestId("selection-marquee")).toBeVisible();await expect.poll(()=>page.getByTestId("file-scroll").evaluate(el=>el.scrollTop)).toBeGreaterThan(100);await page.mouse.up();
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(["import:1:60"]);const stopped=await page.getByTestId("file-scroll").evaluate(el=>el.scrollTop);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));expect(await page.getByTestId("file-scroll").evaluate(el=>el.scrollTop)).toBe(stopped);
});
