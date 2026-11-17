import {test,expect} from "@playwright/test";

test("没有文件架时关闭空窗 不制造空小球或数据",async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem("test-state",JSON.stringify({shelves:[],items:[],jobs:[]}));localStorage.setItem("test-desktop-layout",JSON.stringify({layout:{enabled:false,expanded:true,active_shelf:0,collapsed:[],page:0,preferences:{edge:"free",auto_hide:false,topmost:true}},entries:[],total:0,copying:false,edge_hidden:false}));});
  await page.goto("/tests/harness.html");await page.getByRole("button",{name:"关闭空文件架",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("window:hide");
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!).shelves)).toHaveLength(0);
});

test("打开文件架即可搜索且标题保留 关闭回到小球",async({page})=>{
  await page.setViewportSize({width:420,height:520});
  await page.goto("/tests/harness.html");
  const search=page.getByRole("textbox",{name:"搜索文件",exact:true});
  await expect(search).toBeVisible();
  await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toContainText("灵感收集");
  await page.keyboard.press("Control+f");await expect(search).toBeFocused();
  await search.fill("中文");await expect(page.locator("[data-item-id]")).toHaveCount(1);
  await search.press("Escape");await expect(search).toBeVisible();
  await expect(page.locator("[data-item-id]")).toHaveCount(3);
  await expect(page.getByRole("button",{name:/最小化窗口|最大化窗口|还原窗口/})).toHaveCount(0);
  await page.getByRole("button",{name:"收起文件架",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("collapse:1");
  expect(await page.evaluate(()=>window.testHarness.calls())).not.toContain("window:hide");
});

test("单击小球直接打开完整架 原生拖放期间保持目标固定",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry&count=1");
  const orb=page.getByRole("button",{name:"展开 灵感收集",exact:true});
  await expect(orb).toBeVisible();
  await page.evaluate(()=>window.testHarness.nativeDrag(true,1));await expect(orb).toBeDisabled();
  await page.evaluate(()=>window.testHarness.nativeDrag(false));await orb.click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
  await expect(page.getByTestId("morph-capsule")).toHaveCount(0);
});

test("更多菜单居中 虚化背景 Escape回到入口",async({page})=>{
  page.on("pageerror",error=>console.error("PAGE ERROR",error.message));
  await page.setViewportSize({width:340,height:320});
  await page.goto("/tests/harness.html");
  const trigger=page.getByRole("button",{name:"更多操作",exact:true});await trigger.click();
  const menu=page.getByRole("menu",{name:"更多操作",exact:true});await expect(menu).toBeVisible();
  const b=(await menu.boundingBox())!;
  expect(Math.abs(b.x+b.width/2-170)).toBeLessThan(2);
  expect(Math.abs(b.y+b.height/2-160)).toBeLessThan(2);
  expect(b.y).toBeGreaterThanOrEqual(8);expect(b.y+b.height).toBeLessThanOrEqual(312);
  await expect(page.locator(".shelf-menu-backdrop")).toHaveCSS("backdrop-filter","blur(1.95px)");
  await page.keyboard.press("Escape");await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused();
  await trigger.hover();await expect(page.getByRole("tooltip")).toHaveText("更多操作");
  await expect(trigger).not.toHaveAttribute("title");
});
