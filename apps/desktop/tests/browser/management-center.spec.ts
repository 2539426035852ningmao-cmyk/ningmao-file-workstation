import {test,expect} from "@playwright/test";

test("管理中心按需打开，跨架检索和批量标签保留来源",async({page})=>{
  await page.goto("/tests/harness.html");await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"管理中心",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("manager-open");
  await page.goto("/tests/harness.html?manager");await expect(page.getByRole("heading",{name:"管理中心",exact:true})).toBeVisible({timeout:3000});
  await page.getByRole("button",{name:"素材",exact:true}).click();await page.getByRole("textbox",{name:"搜索已收集素材"}).fill("Alpha");
  await page.getByRole("checkbox",{name:"选择 Alpha.txt",exact:true}).check();await page.getByRole("textbox",{name:"标签名称",exact:true}).fill("项目素材");await page.getByRole("button",{name:"添加标签",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("已更新 1 项");
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!));expect(state.items.find((i:{id:number})=>i.id===1).tags).toEqual(["项目素材"]);expect(state.items).toHaveLength(3);
  await page.getByRole("button",{name:"打开 Alpha.txt 所在文件架"}).click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
});
test("批量标签忽略筛选隐藏项，失败保留输入并可重试",async({page})=>{
  await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"素材",exact:true}).click();await page.getByRole("checkbox",{name:"选择本页文件"}).check();await page.getByRole("textbox",{name:"搜索已收集素材"}).fill("Alpha");
  await page.getByRole("textbox",{name:"标签名称",exact:true}).fill("仅当前结果");await page.evaluate(()=>window.testHarness.fail("合成事务失败"));await page.getByRole("button",{name:"添加标签",exact:true}).click();await expect(page.getByRole("alert")).toContainText("合成事务失败");await expect(page.getByRole("textbox",{name:"标签名称",exact:true})).toHaveValue("仅当前结果");
  await page.getByRole("button",{name:"添加标签",exact:true}).click();await expect(page.getByRole("status")).toContainText("已更新 1 项");
  const items=await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!).items);expect(items.filter((i:{tags:string[]})=>i.tags.length)).toHaveLength(1);
});
test("管理中心的复制任务可以安全取消并刷新记录",async({page})=>{
  await page.goto("/tests/harness.html");await page.evaluate(async()=>{await window.testHarness.tags(1,[]);const state=JSON.parse(localStorage.getItem("test-state")!);state.jobs=[{id:1,shelf_id:1,status:"copying",message:"合成复制任务",staging:null}];localStorage.setItem("test-state",JSON.stringify(state));});
  await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"任务",exact:true}).click();await page.getByRole("button",{name:"取消复制",exact:true}).click();await expect(page.getByText("已取消",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"取消复制",exact:true})).toHaveCount(0);
});
test("贴边细柄在鼠标靠近时请求展开，分页仍可用",async({page})=>{
  await page.setViewportSize({width:64,height:312});await page.mouse.move(63,311);await page.goto("/tests/harness.html?desktop-entry&edge");await expect(page.getByRole("button",{name:"唤出贴边文件架"})).toBeVisible();await page.screenshot({path:`${process.env.M105_TEST_OUTPUT || "test-results"}/p2-edge-handle.png`});await page.getByRole("button",{name:"唤出贴边文件架"}).hover();await expect(page.getByRole("button",{name:/^展开 /})).toHaveCount(5);await expect(page.getByRole("button",{name:"移动悬浮入口"})).toBeDisabled();
});
for(const [width,height,theme] of [[1040,720,"dark"],[760,520,"light"]] as const) {
  test(`管理中心 ${width}×${height} ${theme} 操作可达且不横向溢出`,async({page})=>{
    await page.setViewportSize({width,height});await page.addInitScript(value=>localStorage.setItem("ningmao-theme",value),theme);
    await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"素材",exact:true}).click();await expect(page.getByRole("textbox",{name:"搜索已收集素材"})).toBeVisible();await expect(page.getByRole("checkbox",{name:"选择 Alpha.txt"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole("button",{name:"素材",exact:true})).toHaveAttribute("aria-current","page");
    const root=process.env.M105_TEST_OUTPUT || "test-results";await page.screenshot({path:`${root}/p2-manager-${width}-${theme}.png`});
    await page.getByRole("button",{name:"设置",exact:true}).click();await expect(page.getByRole("combobox",{name:"入口位置模式"})).toBeVisible();await page.screenshot({path:`${root}/p2-manager-settings-${width}-${theme}.png`});
  });
}
test("只读布局设置显示临时应用，不误报已保存",async({page})=>{
  await page.goto("/tests/harness.html?manager&readonly-layout");await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("combobox",{name:"入口位置模式"}).selectOption("left");await page.getByRole("button",{name:"保存桌面设置"}).click();await expect(page.getByRole("status")).toContainText("临时应用");await expect(page.getByRole("status")).not.toContainText("已保存");await expect(page.getByRole("alert")).toContainText("只读");
});
test("管理中心切换主题同步到已打开的文件架",async({page,context})=>{
  await page.goto("/tests/harness.html");const manager=await context.newPage();await manager.goto("/tests/harness.html?manager");await manager.getByRole("button",{name:"设置",exact:true}).click();await manager.getByRole("combobox",{name:"应用主题"}).selectOption("light");await expect(page.locator("html")).toHaveClass("light");await manager.close();
});
test("管理标签通知只更新元数据，不触发文件架目录刷新",async({page})=>{
  await page.goto("/tests/harness.html");await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();await page.evaluate(async()=>{await window.testHarness.tags(1,["管理标签"]);window.testHarness.failNextSnapshot("不应触发目录刷新");window.testHarness.notifyMetadata();});
  await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();await page.getByRole("button",{name:"详情",exact:true}).click();await expect(page.getByText("管理标签",{exact:true})).toBeVisible();await expect(page.getByRole("alert")).toHaveCount(0);
});
test("桌面设置保存贴边和置顶，管理中心不占用日常小架",async({page})=>{
  await page.goto("/tests/harness.html?manager");await expect(page.getByRole("heading",{name:"管理中心",exact:true})).toBeVisible({timeout:3000});
  await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("combobox",{name:"入口位置模式"}).selectOption("right");await page.getByRole("checkbox",{name:"离开入口后自动收起"}).check();await page.getByRole("checkbox",{name:"悬浮入口置顶"}).uncheck();await page.getByRole("button",{name:"保存桌面设置"}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain('configure:right:true:false');await expect(page.getByRole("status")).toContainText("桌面设置已保存");
});
