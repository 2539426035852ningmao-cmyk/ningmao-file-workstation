import {test,expect} from "@playwright/test";

test("最近素材定位复用完整架选中与失效引用路径，不打开或改动文件",async({page})=>{
 await page.goto('/tests/harness.html');await expect(page.getByRole('status').last()).toContainText('文件架已恢复');
 await page.keyboard.press('Control+f');await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('Alpha');
 const before=await page.evaluate(()=>localStorage.getItem('test-state'));
 await page.evaluate(()=>window.testHarness.collect(1,'locate',2));
 const item=page.getByRole('button',{name:'选择 中文 文件.txt',exact:true});await expect(item).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>localStorage.getItem('test-state'))).toBe(before);
 await page.evaluate(()=>{window.testHarness.missing(2);window.testHarness.collect(1,'locate',2);});
 await expect(item).toHaveAttribute('aria-pressed','true');await expect(item).toContainText('失效');
 expect((await page.evaluate(()=>window.testHarness.calls())).some(call=>call.startsWith('open:')||call.startsWith('import:'))).toBe(false);
});

test("完整架接收收集请求后复用添加及粘贴，目标是请求中的文件架",async({page})=>{
 for(const action of ['add','paste'] as const){
  await page.goto('/tests/harness.html');await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.getByRole('status').last()).toContainText('文件架已恢复');
  await page.evaluate(action=>window.testHarness.collect(2,action),action);
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain('import:2:1');
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('test-state')!));
  expect(state.items.filter((i:{shelf_id:number})=>i.shelf_id===1)).toHaveLength(3);
  expect(state.items.filter((i:{shelf_id:number})=>i.shelf_id===2)).toHaveLength(1);
 }
});

test("收集添加取消或失败时不丢原有引用",async({page})=>{
 await page.goto('/tests/harness.html?chooser-cancel');await expect(page.getByRole('status').last()).toContainText('文件架已恢复');
 await page.evaluate(()=>window.testHarness.collect(1,'add'));await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain('choose-files');
 expect((await page.evaluate(()=>window.testHarness.calls())).some(call=>call.startsWith('import:'))).toBe(false);
 await expect(page.locator('[data-item-id]')).toHaveCount(3);
 await page.goto('/tests/harness.html');await expect(page.getByRole('status').last()).toContainText('文件架已恢复');
 await page.evaluate(()=>{window.testHarness.fail('合成导入失败');window.testHarness.collect(1,'paste');});
 await expect(page.getByRole('alert')).toContainText('合成导入失败');await expect(page.locator('[data-item-id]')).toHaveCount(3);
});
