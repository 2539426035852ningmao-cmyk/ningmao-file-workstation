import {test,expect} from "@playwright/test";
test("新建文件架后收起到真实桌面入口命令，已有内容保持",async({page})=>{
  await page.goto("/tests/harness.html");await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitem",{name:"新建文件架",exact:true}).click();
  const form=page.getByRole("dialog",{name:"新建文件架",exact:true});await form.getByRole("textbox",{name:"文件架名称",exact:true}).fill("项目素材");await form.getByRole("button",{name:"创建",exact:true}).click();
  await expect(form).toHaveCount(0);await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toContainText("项目素材");await expect(page.getByRole("heading",{name:"拖入文件，添加引用",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"收起到悬浮入口",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("collapse:4");
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name:"灵感收集",exact:true}).click();await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
});
test("跨架仅复制选中引用，来源和标签保留，排除绑定目录",async({page})=>{
  await page.goto("/tests/harness.html");await page.evaluate(()=>window.testHarness.tags(1,["精选"]));
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"刷新文件状态",exact:true}).click();
  await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"复制选中引用到其他架",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"复制引用到其他架",exact:true});await sheet.getByRole("combobox",{name:"目标文件架"}).selectOption("2");await sheet.getByRole("button",{name:"复制引用",exact:true}).click();await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name:"本次中转",exact:true}).click();await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!));expect(state.items.filter((i:{name:string})=>i.name==="Alpha.txt")).toHaveLength(2);expect(state.items.find((i:{shelf_id:number})=>i.shelf_id===2).tags).toEqual(["精选"]);
});
test("新建失败保持输入并可修正重试",async({page})=>{
  await page.goto("/tests/harness.html");await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitem",{name:"新建文件架",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"新建文件架",exact:true});await sheet.getByRole("textbox",{name:"文件架名称"}).fill("灵感收集");await sheet.getByRole("button",{name:"创建",exact:true}).click();await expect(sheet.getByRole("alert")).toContainText("已存在");await expect(sheet.getByRole("textbox")).toHaveValue("灵感收集");await sheet.getByRole("textbox").fill("临时素材");await sheet.getByRole("checkbox",{name:"仅本次中转"}).check();await sheet.getByRole("button",{name:"创建",exact:true}).click();await expect(sheet).toHaveCount(0);await expect(page.getByText("本次中转 · 仅保存引用",{exact:true})).toBeVisible();
});
test("轻量入口点击显式目标ID，Dock分页不截断文件架",async({page})=>{
  await page.setViewportSize({width:64,height:312});await page.goto("/tests/harness.html?desktop-entry");await expect(page.getByRole("button",{name:/^展开 /})).toHaveCount(5);await expect(page.getByRole("button",{name:"上一页文件架"})).toBeDisabled();
  await page.getByRole("button",{name:"下一页文件架"}).click();await expect(page.getByRole("button",{name:/^展开 /})).toHaveCount(2);await page.getByRole("button",{name:"展开 项目 7",exact:true}).press("Control+Enter");await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:7");await expect(page.getByRole("button",{name:"下一页文件架"})).toBeDisabled();
  await page.screenshot({path:process.env.M105_TEST_OUTPUT?`${process.env.M105_TEST_OUTPUT}/p2-dock.png`:"test-results/p2-dock.png"});
});
