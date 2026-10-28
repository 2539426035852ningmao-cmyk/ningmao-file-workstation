import {test,expect} from "@playwright/test";

test("显式多选后才比较文件，结果区分同一实体和内容相同副本",async({page})=>{
  await page.goto("/tests/harness.html");
  await expect(page.getByRole("button",{name:"更多操作",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.testHarness.calls())).not.toContain("duplicates:1,2,3");
  await page.getByRole("button",{name:"选择 Alpha.txt"}).click();
  await page.getByRole("button",{name:"选择 中文 文件.txt"}).click({modifiers:["Control"]});
  await page.getByRole("button",{name:"选择 Gamma.txt"}).click({modifiers:["Control"]});
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"比较选中文件内容"}).click();
  const dialog=page.getByRole("dialog",{name:"重复文件分析"});
  await expect(dialog.getByText("同一文件的多个引用")).toBeVisible();
  await expect(dialog.getByText("不同文件，内容相同")).toBeVisible();
  await expect(dialog).toContainText("Alpha.txt");
  await expect(dialog).toContainText("中文 文件.txt");
  await expect(dialog).toContainText("Gamma.txt");
  expect(await dialog.innerHTML()).not.toContain("SYNTHETIC/");
  expect(await page.evaluate(()=>window.testHarness.calls())).toContain("duplicates:1,2,3");
});

async function selectTwo(page:import("@playwright/test").Page, suffix="") {
  await page.goto("/tests/harness.html"+suffix);
  await expect(page.getByRole("button",{name:"更多操作",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"选择 Alpha.txt"}).click();
  await page.getByRole("button",{name:"选择 中文 文件.txt"}).click({modifiers:["Control"]});
}
async function launch(page:import("@playwright/test").Page) {
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"比较选中文件内容",exact:true}).click();
}
test("无重复结果在最小尺寸深浅主题中清晰显示",async({page})=>{
  await page.setViewportSize({width:340,height:320});
  await selectTwo(page,"?duplicates-empty"); await launch(page);
  const dialog=page.getByRole("dialog",{name:"重复文件分析"});
  await expect(dialog.getByText("所选文件没有发现相同内容或同一文件的多个引用。")).toBeVisible();
  for (const theme of ["light","dark"]) {
    await page.evaluate(value=>{document.documentElement.className=value;},theme);
    await expect(dialog).toHaveCSS("background-color",theme==="light"?"rgb(255, 255, 255)":"rgb(25, 27, 32)");
    await expect.poll(async()=>{const box=await dialog.boundingBox();return !!box && box.x>=0 && box.x+box.width<=340 && box.height<=320;}).toBe(true);
    await page.screenshot({path:`D:/Ningmao-Codex-P4-20261028-filters/duplicates-${theme}.png`});
  }
});
test("分析失败显示明确错误并保留选择",async({page})=>{
  await selectTwo(page);
  await page.evaluate(()=>window.testHarness.fail("文件被占用或无法安全读取。"));
  await launch(page);
  await expect(page.getByRole("alert")).toContainText("文件被占用或无法安全读取。");
  await expect(page.getByRole("button",{name:"选择 Alpha.txt"})).toHaveAttribute("aria-pressed","true");
});
test("分析时选择变化会丢弃旧结果并提示重新比较",async({page})=>{
  await selectTwo(page,"?duplicates-delay"); await launch(page);
  await expect(page.getByText("正在比较选中文件内容…")).toBeVisible();
  await page.getByRole("button",{name:"选择 Gamma.txt"}).click();
  await expect(page.getByText("文件或选择已变化，请重新比较。")).toBeVisible();
  await expect(page.getByRole("dialog",{name:"重复文件分析"})).toHaveCount(0);
});

test("分析期间无变化刷新不会丢弃有效结果",async({page})=>{
  await selectTwo(page,"?duplicates-delay"); await launch(page);
  await expect(page.getByText("正在比较选中文件内容…")).toBeVisible();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"刷新文件状态"}).click();
  await expect(page.getByRole("dialog",{name:"重复文件分析"})).toBeVisible({timeout:5000});
});

test("分析期间所选引用状态变化会拒绝旧结果",async({page})=>{
  await selectTwo(page,"?duplicates-delay"); await launch(page);
  await expect(page.getByText("正在比较选中文件内容…")).toBeVisible();
  await page.evaluate(()=>window.testHarness.missing(1));
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"刷新文件状态"}).click();
  await expect(page.getByText("文件或选择已变化，请重新比较。")).toBeVisible();
  await expect(page.getByRole("dialog",{name:"重复文件分析"})).toHaveCount(0);
});
