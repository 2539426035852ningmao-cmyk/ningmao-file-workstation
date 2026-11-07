import {test,expect} from "@playwright/test";

test("胶囊直接展示最近素材与数量，再次点击直接打开完整架",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry&count=1");
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await expect(page.getByTestId("capsule-file")).toHaveCount(3);
  await expect(page.getByText("3 项 · 仅保存引用",{exact:true})).toBeVisible();
  await expect(page.locator(".quick-peek")).toHaveCount(0);
  await page.locator('.orb-control[data-orb-mode="capsule"]').screenshot({path:test.info().outputPath("capsule.png"),animations:"disabled"});
  await page.getByRole("button",{name:"打开 灵感收集 文件架",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
  expect((await page.evaluate(()=>window.testHarness.calls())).some(call=>call.includes("quick-peek"))).toBe(false);
});

test("胶囊接收拖动时锁住打开和切架，取消后可收回圆球",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry&count=3");
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  const capsule=page.getByTestId("morph-capsule"),before=await capsule.boundingBox();
  await page.evaluate(()=>window.testHarness.nativeDrag(true,1));
  await expect(capsule).toBeDisabled();
  await expect(page.getByRole("combobox",{name:"打开其他文件架"})).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(await capsule.boundingBox()).toEqual(before);
  await page.evaluate(()=>window.testHarness.nativeDrag(false));
  await expect(capsule).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:"展开 灵感收集",exact:true})).toBeVisible();
});

test("胶囊切架前收回当前入口，不让旧胶囊遮住新完整架",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry&count=3");
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await page.getByRole("combobox",{name:"打开其他文件架"}).selectOption("2");
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:2");
  await expect(page.getByTestId("morph-capsule")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"展开 灵感收集",exact:true})).toBeVisible();
});
