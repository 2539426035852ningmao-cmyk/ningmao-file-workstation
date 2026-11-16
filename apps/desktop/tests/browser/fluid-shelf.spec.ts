import {test,expect} from "@playwright/test";

test("历史容量限制就地提示并跨重启保存",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"设置",exact:true}).click();
  const capacity=page.getByRole("spinbutton",{name:"撤销历史容量",exact:true});await expect(capacity).toHaveValue("100");
  await capacity.fill("1001");await capacity.press("Enter");await expect(page.getByRole("alert")).toContainText("1至1000");
  await capacity.fill("250");await capacity.press("Enter");await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("test-organize-history")!).capacity)).toBe(250);
  await page.reload();await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"设置",exact:true}).click();await expect(capacity).toHaveValue("250");
});

test("批量整理可跨重启撤销重做 输入框保留文本撤销",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();
  await page.getByRole("button",{name:"选择 中文 文件.txt",exact:true}).click({modifiers:["Control"]});
  await page.keyboard.press("Delete");
  await expect(page.locator("[data-item-id]")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"撤销",exact:true})).toBeEnabled();
  await page.reload();await page.getByRole("button",{name:"撤销",exact:true}).click();
  await expect(page.locator("[data-item-id]")).toHaveCount(3);
  const search=page.getByRole("textbox",{name:"搜索文件",exact:true});await search.fill("Gamma");await search.press("Control+z");
  await expect(page.getByRole("button",{name:"重做",exact:true})).toBeEnabled();
  await search.fill("");await page.getByRole("button",{name:"重做",exact:true}).click();await expect(page.locator("[data-item-id]")).toHaveCount(1);
  await expect(page.locator(".undo-record")).toHaveCount(0);
});

for(const width of [340,420,640])test(`场景面板 ${width} 固定底部并保留可用操作`,async({page},info)=>{
  await page.setViewportSize({width,height:width===340?320:520});
  await page.goto("/tests/harness.html");await expect(page.locator(".workstation")).toHaveAttribute("data-shape","open");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"显示与整理",exact:true}).click();
  await expect(page.getByRole("menuitemradio",{name:"网格视图",exact:true})).toBeVisible();
  await expect(page.getByRole("menuitem",{name:"账户 预留",exact:true})).toBeDisabled();
  await page.getByRole("menuitem",{name:"设置",exact:true}).click();
  await page.getByRole("menuitemradio",{name:"白色主题",exact:true}).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"帮助",exact:true}).click();
  await expect(page.getByRole("region",{name:"帮助",exact:true}).getByText("Ctrl F",{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath(`scene-${width}.png`)});
});

test("收回中再次点击表情连续反转 不提交过期收回",async({page})=>{
  await page.goto("/tests/harness.html");
  const shell=page.locator(".workstation"),face=page.getByRole("button",{name:"表情 收起文件架",exact:true});
  await expect(shell).toHaveAttribute("data-shape","open");
  await face.click();await expect(shell).toHaveAttribute("data-shape","closing");
  await face.click();await expect(shell).toHaveAttribute("data-shape","open");
  expect(await page.evaluate(()=>window.testHarness.calls())).not.toContain("collapse:1");
  const clip=await shell.evaluate(node=>getComputedStyle(node).clipPath);
  expect(clip).toBe("inset(0px round 20px)");
});

test("表情单击收回 右键直接选择完整主题",async({page})=>{
  await page.goto("/tests/harness.html");
  const face=page.getByRole("button",{name:"表情 收起文件架",exact:true});
  await face.click({button:"right"});
  await page.getByRole("menuitemradio",{name:"白色主题",exact:true}).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem("ningmao-theme"))).toBe("light");
  await face.click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("collapse:1");
});
