import {test,expect} from "@playwright/test";

test("完整架接收胶囊请求后复用添加及粘贴，目标是请求中的文件架",async({page})=>{
 for(const action of ['add','paste'] as const){
  await page.goto('/tests/harness.html');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('status').last()).toContainText('文件架已恢复');
  await page.evaluate(action=>window.testHarness.collect(2,action),action);
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain('import:2:1');
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('test-state')!));
  expect(state.items.filter((i:{shelf_id:number})=>i.shelf_id===1)).toHaveLength(3);
  expect(state.items.filter((i:{shelf_id:number})=>i.shelf_id===2)).toHaveLength(1);
 }
});

test("胶囊添加取消或失败时不丢原有引用",async({page})=>{
 await page.goto('/tests/harness.html?chooser-cancel');await expect(page.getByRole('status').last()).toContainText('文件架已恢复');
 await page.evaluate(()=>window.testHarness.collect(1,'add'));await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain('choose-files');
 expect((await page.evaluate(()=>window.testHarness.calls())).some(call=>call.startsWith('import:'))).toBe(false);
 await expect(page.locator('[data-item-id]')).toHaveCount(3);
 await page.goto('/tests/harness.html');await expect(page.getByRole('status').last()).toContainText('文件架已恢复');
 await page.evaluate(()=>{window.testHarness.fail('合成导入失败');window.testHarness.collect(1,'paste');});
 await expect(page.getByRole('alert')).toContainText('合成导入失败');await expect(page.locator('[data-item-id]')).toHaveCount(3);
});

test("胶囊添加与粘贴请求完整架处理，不在入口读文件",async({page})=>{
 for(const [label,action] of [["添加文件到 灵感收集","add"],["粘贴文件到 灵感收集","paste"]]){
  await page.goto('/tests/harness.html?desktop-entry&count=1');await page.getByRole('button',{name:'展开 灵感收集',exact:true}).click();
  const button=page.getByRole('button',{name:label,exact:true});await expect(button).toBeVisible({timeout:1500});
  await page.evaluate(()=>window.testHarness.nativeDrag(true,1));await expect(button).toBeDisabled();await page.evaluate(()=>window.testHarness.nativeDrag(false));
  await page.evaluate(()=>window.testHarness.notifyCopying(true));await expect(button).toBeDisabled();await page.evaluate(()=>window.testHarness.notifyCopying(false));
  const summary=page.getByText('3 项 · 仅保存引用',{exact:true});await expect(summary).toBeVisible();expect(await summary.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  const bounds=await button.boundingBox(),capsule=await page.getByTestId('morph-capsule').locator('..').boundingBox();expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(capsule!.x+capsule!.width);
  if(action==='add')await page.locator('.orb-control[data-orb-mode="capsule"]').screenshot({path:'test-results/capsule-collect.png',animations:'disabled'});
  await button.click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain(`collect:${action}:1`);
  expect((await page.evaluate(()=>window.testHarness.calls())).some(call=>call.startsWith('import:')||call==='clipboard-files')).toBe(false);
 }
});

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
