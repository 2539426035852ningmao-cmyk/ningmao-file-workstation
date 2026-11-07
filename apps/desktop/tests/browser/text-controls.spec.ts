import {test,expect} from "@playwright/test";

test("文件文字保留完整行高，长架名不挤占窗口控制和拖动区",async({page})=>{
  for(const width of [340,420]){
    await page.setViewportSize({width,height:520});
    await page.goto("/tests/harness.html");
    await page.evaluate(()=>window.testHarness.tags(1,[]));
    await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem("test-state")!);state.shelves[0].name="这是一个用于日常收集整理的长文件架名称";localStorage.setItem("test-state",JSON.stringify(state));});
    await page.reload();
    const header=page.locator(".shelf-header");
    await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toContainText("这是一个");
    await expect(page.getByRole("button",{name:"切换文件架",exact:true})).toHaveAttribute("title","这是一个用于日常收集整理的长文件架名称");
    const metrics=await header.evaluate(el=>({width:el.scrollWidth,drag:el.querySelector(".titlebar-drag-space")!.getBoundingClientRect().width,controls:[...el.querySelectorAll(".window-controls button")].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}));
    expect(metrics.width).toBeLessThanOrEqual(width);
    expect(metrics.drag).toBeGreaterThanOrEqual(20);
    for(const control of metrics.controls){expect(control.width).toBeGreaterThanOrEqual(30);expect(control.height).toBeGreaterThanOrEqual(30);}
    await page.getByRole("button",{name:"最小化窗口",exact:true}).focus();
    await page.keyboard.press("Tab");await expect(page.getByRole("button",{name:"最大化窗口",exact:true})).toBeFocused();
    await page.keyboard.press("Tab");await expect(page.getByRole("button",{name:"暂时关闭窗口",exact:true})).toBeFocused();
    for(const size of ["小缩略图","中缩略图","大缩略图"]){
      await page.getByRole("button",{name:"更多操作",exact:true}).click();
      await page.getByRole("menuitemradio",{name:size,exact:true}).click();
      const text=await page.locator(".asset-name,.asset-meta").evaluateAll(nodes=>nodes.map(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight)})));
      for(const row of text)expect(row.height).toBeGreaterThanOrEqual(row.line);
    }
    for(const theme of ["light","dark","blue"]){
      await page.evaluate(value=>localStorage.setItem("ningmao-theme",value),theme);await page.reload();
      await expect(page.locator("html")).toHaveClass(theme);
      await page.screenshot({path:`${process.env.M105_TEST_OUTPUT||"test-results"}/text-controls-${width}-${theme}.png`});
    }
  }
});

test("管理设置的备份操作留出间隔，窗口找回与下一组分开",async({page})=>{
  await page.setViewportSize({width:760,height:520});await page.goto("/tests/harness.html?manager");
  await page.getByRole("button",{name:"设置",exact:true}).click();
  const actions=page.getByRole("group",{name:"数据备份操作"});
  const buttons=await actions.locator("button").evaluateAll(nodes=>nodes.map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top};}));
  expect(buttons).toHaveLength(2);expect(buttons[1].left-buttons[0].right).toBeGreaterThanOrEqual(8);
  const restore=page.getByRole("button",{name:"找回屏幕外窗口",exact:true});
  await expect(restore).toBeVisible();
  const gap=await page.locator(".manager-window-actions").evaluate(e=>parseFloat(getComputedStyle(e).marginBottom));expect(gap).toBeGreaterThanOrEqual(24);
  await restore.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${process.env.M105_TEST_OUTPUT||"test-results"}/text-controls-manager-settings.png`});
});
