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
test("本地规则建议解释依据，确认后只写内部标签",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.evaluate(async()=>{await window.testHarness.tags(1,[]);const state=JSON.parse(localStorage.getItem("test-state")!);state.items[0]={...state.items[0],name:"产品截图.png",path:"SYNTHETIC/产品截图.png",kind:"png"};localStorage.setItem("test-state",JSON.stringify(state));});
  await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"素材",exact:true}).click();
  await page.getByRole("checkbox",{name:"选择 产品截图.png",exact:true}).check();await page.getByRole("button",{name:"生成本地规则建议",exact:true}).click();
  const suggestions=page.getByRole("region",{name:"本地规则建议",exact:true});
  await expect(suggestions).toContainText("不使用模型或网络");await expect(suggestions).toContainText("文件类型为 PNG");await expect(suggestions).toContainText("文件名含“截图”");
  await suggestions.getByRole("button",{name:"添加标签 截图",exact:true}).click();await expect(page.getByRole("status")).toContainText("已添加标签“截图”");
  const item=await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!).items.find((value:{id:number})=>value.id===1));
  expect(item).toMatchObject({path:"SYNTHETIC/产品截图.png",name:"产品截图.png",tags:["截图"]});
});
test("管理中心的复制任务可以安全取消并刷新记录",async({page})=>{
  await page.goto("/tests/harness.html");await page.evaluate(async()=>{await window.testHarness.tags(1,[]);const state=JSON.parse(localStorage.getItem("test-state")!);state.jobs=[{id:1,shelf_id:1,status:"copying",message:"合成复制任务",staging:null}];localStorage.setItem("test-state",JSON.stringify(state));});
  await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"任务",exact:true}).click();await page.getByRole("button",{name:"取消复制",exact:true}).click();await expect(page.getByText("已取消",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"取消复制",exact:true})).toHaveCount(0);
});
test("贴边细柄在鼠标靠近时请求展开，分页仍可用",async({page})=>{
  await page.setViewportSize({width:64,height:312});await page.goto("/tests/harness.html?desktop-entry&edge");
  // Browsers may enter at (0,0) after navigation. Arrange folded native state only after leaving.
  await page.mouse.move(63,311);await page.evaluate(()=>window.testHarness.foldEntry());
  await expect(page.getByRole("button",{name:"唤出贴边文件架"})).toBeVisible();await page.screenshot({path:`${process.env.M105_TEST_OUTPUT || "test-results"}/p2-edge-handle.png`});await page.getByRole("button",{name:"唤出贴边文件架"}).hover();await expect(page.getByRole("button",{name:/^展开 /})).toHaveCount(5);// B01 now allows dragging the visible body away from a snapped edge.
  const orb=page.getByRole("button",{name:/^展开 /}).first(),box=(await orb.boundingBox())!;await page.mouse.move(box.x+24,box.y+24);await page.mouse.down();await page.mouse.move(box.x+40,box.y+24);await page.mouse.up();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("move-entry");
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


test("管理检索支持名称与标签组合，筛选不修改来源",async({page})=>{
 await page.goto("/tests/harness.html?manager");await page.evaluate(async()=>{await window.testHarness.tags(1,["项目素材"]);window.testHarness.notifyMetadata();});
 await page.getByRole("button",{name:"素材",exact:true}).click();const search=page.getByRole("textbox",{name:"搜索已收集素材"});
 await search.fill("  项目素材  ");await expect(page.getByRole("checkbox",{name:"选择 Alpha.txt",exact:true})).toBeVisible();await expect(page.getByRole("checkbox",{name:"选择 Gamma.txt",exact:true})).toHaveCount(0);
 await search.fill("ALPHA 项目");await expect(page.getByRole("checkbox",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
 await search.fill("Gamma 项目");await expect(page.getByText("没有匹配的已收集素材",{exact:true})).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!));expect(saved.items).toHaveLength(3);expect(saved.items[0].path).toBe("SYNTHETIC/Alpha.txt");
});

test("管理任务从进度事件发现新任务，持续更新且完成后不残留进度",async({page})=>{
 await page.setViewportSize({width:1040,height:720});await page.addInitScript(()=>localStorage.setItem("ningmao-theme","dark"));
 await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"任务",exact:true}).click();await expect(page.getByText("暂无复制任务",{exact:true})).toBeVisible();
 await page.evaluate(async()=>{await window.testHarness.tags(1,[]);const saved=JSON.parse(localStorage.getItem("test-state")!);saved.jobs=[{id:1,shelf_id:1,status:"queued",message:"等待复制2项",staging:null}];localStorage.setItem("test-state",JSON.stringify(saved));window.testHarness.notifyProgress({job_id:1,name:"合成大文件.bin",file_index:1,file_count:2,bytes:512,total:1024});});
 const progress=page.getByRole("progressbar",{name:"当前文件复制进度"});await expect(progress).toHaveAttribute("value","512");await expect(page.getByText("合成大文件.bin · 1/2",{exact:true})).toBeVisible();await expect(page.getByText("复制中",{exact:true})).toBeVisible();
 await page.screenshot({path:`${process.env.M105_TEST_OUTPUT || "test-results"}/manager-task-progress-dark.png`});
 const reads=await page.evaluate(()=>window.testHarness.calls().filter(c=>c==="management-snapshot").length);
 await page.evaluate(()=>{for(let bytes=600;bytes<=1000;bytes+=100)window.testHarness.notifyProgress({job_id:1,name:"合成大文件.bin",file_index:1,file_count:2,bytes,total:1024});});await expect(progress).toHaveAttribute("value","1000");expect(await page.evaluate(()=>window.testHarness.calls().filter(c=>c==="management-snapshot").length)).toBe(reads);
 await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem("test-state")!);saved.jobs[0].status="completed";saved.jobs[0].message="复制完成；来源保留";localStorage.setItem("test-state",JSON.stringify(saved));window.testHarness.notifyFinished("复制完成；来源保留");});await expect(page.getByText("已完成",{exact:true})).toBeVisible();await expect(progress).toHaveCount(0);await expect(page.getByRole("button",{name:"取消复制",exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.testHarness.notifyProgress({job_id:1,name:"迟到事件",file_index:2,file_count:2,bytes:1024,total:1024}));await expect(progress).toHaveCount(0);await expect(page.getByText("已完成",{exact:true})).toBeVisible();
});


test("任务可按架与状态查找，取消请求等待结果且不重复发送",async({page})=>{
 await page.setViewportSize({width:760,height:520});await page.addInitScript(()=>localStorage.setItem("ningmao-theme","light"));
 await page.goto("/tests/harness.html");await page.evaluate(async()=>{await window.testHarness.tags(1,[]);const saved=JSON.parse(localStorage.getItem("test-state")!);saved.jobs=[{id:1,shelf_id:1,status:"copying",message:"正在复制合成素材",staging:null},{id:2,shelf_id:2,status:"failed",message:"合成读取失败",staging:null},{id:3,shelf_id:1,status:"completed",message:"合成复制成功",staging:null}];localStorage.setItem("test-state",JSON.stringify(saved));});
 await page.goto("/tests/harness.html?manager&pending-cancel");await page.getByRole("button",{name:"任务",exact:true}).click();
 await page.getByRole("combobox",{name:"任务状态"}).selectOption("attention");await expect(page.getByRole("article",{name:"复制任务 2",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"取消复制",exact:true})).toHaveCount(0);
 await page.getByRole("combobox",{name:"任务文件架"}).selectOption("1");await expect(page.getByText("没有匹配的复制任务",{exact:true})).toBeVisible();
 await page.getByRole("combobox",{name:"任务状态"}).selectOption("running");await page.getByRole("button",{name:"取消复制",exact:true}).click();await expect(page.getByRole("button",{name:"取消中…",exact:true})).toBeDisabled();await expect(page.getByRole("status")).toContainText("已请求取消");expect(await page.evaluate(()=>window.testHarness.calls().filter(c=>c==="cancel:1").length)).toBe(1);await page.screenshot({path:`${process.env.M105_TEST_OUTPUT || "test-results"}/manager-task-cancelling-light.png`});
 await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem("test-state")!);saved.jobs[0].status="cancelled";saved.jobs[0].message="已取消；来源保留";localStorage.setItem("test-state",JSON.stringify(saved));window.testHarness.notifyFinished("已取消；来源保留");});await expect(page.getByRole("status")).toHaveText("已取消；来源保留");await expect(page.getByRole("button",{name:"取消中…",exact:true})).toHaveCount(0);
 await page.getByRole("combobox",{name:"任务状态"}).selectOption("finished");await expect(page.getByRole("article")).toHaveCount(2);await expect(page.getByRole("article",{name:"复制任务 2",exact:true})).toHaveCount(0);await page.getByRole("combobox",{name:"任务文件架"}).selectOption("0");await expect(page.getByRole("article")).toHaveCount(3);
});


test("复制任务创建后首个字节进度之前即可在管理中心取消",async({page})=>{
 await page.goto("/tests/harness.html?manager&pending-cancel");await page.getByRole("button",{name:"任务",exact:true}).click();await expect(page.getByText("暂无复制任务",{exact:true})).toBeVisible();
 await page.evaluate(async()=>{await window.testHarness.tags(1,[]);const saved=JSON.parse(localStorage.getItem("test-state")!);saved.jobs=[{id:1,shelf_id:1,status:"queued",message:"等待复制2项",staging:null}];localStorage.setItem("test-state",JSON.stringify(saved));window.testHarness.notifyCopying(true);});
 await expect(page.getByText("等待中",{exact:true})).toBeVisible();await page.getByRole("button",{name:"取消复制",exact:true}).click();await expect(page.getByRole("button",{name:"取消中…",exact:true})).toBeDisabled();expect(await page.evaluate(()=>window.testHarness.calls().filter(c=>c==="cancel:1").length)).toBe(1);
});
