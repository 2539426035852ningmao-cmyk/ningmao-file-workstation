import {test,expect} from "@playwright/test";

test("同宿主收起再展开保留搜索和选择，隐藏时不响应文件快捷键",async({page})=>{
  await page.goto('/tests/harness.html?morph-probe');
  await page.getByRole('button',{name:'选择 Alpha.txt',exact:true}).click();
  await page.keyboard.press('Control+f');
  await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('Alpha');
  const viewport=page.locator('.morph-file-host');
  await viewport.evaluate(el=>el.setAttribute('data-instance','retained'));
  await page.getByRole('button',{name:'收起到悬浮入口',exact:true}).click();
  await expect(page.locator('[data-morph-mode]')).toHaveAttribute('data-morph-mode','capsule',{timeout:5000});
  await page.getByRole('button',{name:'收起为悬浮球',exact:true}).click();
  await expect(page.locator('[data-morph-mode]')).toHaveAttribute('data-morph-mode','orb');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'展开横向工作层',exact:true}).click();
  await page.getByRole('button',{name:'打开完整文件架',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'搜索文件',exact:true})).toHaveValue('Alpha');
  await expect(page.getByRole('button',{name:'选择 Alpha.txt',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(viewport).toHaveAttribute('data-instance','retained');
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
});

test("形变可反向，原生拖入信号冻结几何，20次往返后无活动动画",async({page})=>{
  await page.goto('/tests/harness.html?morph-probe');
  const surface=page.locator('[data-morph-mode]');
  await expect(surface).toHaveAttribute('data-morph-mode','full');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(async()=>Number(await surface.getAttribute('data-width'))).toBeLessThan(410);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(surface).toHaveAttribute('data-morph-mode','full');
  await page.evaluate(()=>window.testHarness.hover(true));
  const before=await surface.boundingBox();
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(150);
  expect(await surface.boundingBox()).toEqual(before);
  await page.evaluate(()=>window.testHarness.hover(false));
  await expect(surface).toHaveAttribute('data-morph-mode','capsule');
  await page.getByRole('button',{name:'打开完整文件架',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'运行20次形变探针',exact:true}).click();
  await expect(page.getByRole('status',{name:'形变探针结果'})).toContainText('20 / 20',{timeout:15000});
  await expect(surface).toHaveAttribute('data-morph-mode','full');
  await expect(surface).toHaveAttribute('data-animating','false');
});

test("固定文件视口在收起和展开后保留滚动位置",async({page})=>{
  await page.setViewportSize({width:420,height:520});
  await page.addInitScript(()=>localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'合成滚动架',kind:'persistent',root:null,available:true}],items:Array.from({length:80},(_,i)=>({id:i+1,shelf_id:1,path:`SYNTHETIC/File-${i}.txt`,name:`File-${i}.txt`,kind:'txt',bytes:42,modified:1,status:'normal',tags:[]})),jobs:[]})));
  await page.goto('/tests/harness.html?morph-probe');
  const scroll=page.locator('.file-scroll');
  await expect(page.getByRole('button',{name:'选择 File-0.txt',exact:true})).toBeVisible();
  await scroll.evaluate(el=>{el.scrollTop=600;});
  const before=await scroll.evaluate(el=>el.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.getByRole('button',{name:'收起到悬浮入口',exact:true}).click();
  await expect(page.locator('[data-morph-mode]')).toHaveAttribute('data-morph-mode','capsule');
  await page.getByRole('button',{name:'打开完整文件架',exact:true}).click();
  await expect(page.locator('[data-morph-mode]')).toHaveAttribute('data-morph-mode','full');
  expect(await scroll.evaluate(el=>el.scrollTop)).toBe(before);
});
