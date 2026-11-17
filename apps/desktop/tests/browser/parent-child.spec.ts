import {test,expect} from "@playwright/test";

test("快速拆出保持主窗口上下文，重复拆出不重复编号，收回不切换主架",async({page})=>{
  await page.goto('/tests/harness.html');
  await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('Alpha');
  await page.getByRole('button',{name:'拆出当前文件架',exact:true}).click();
  await expect(page.getByRole('button',{name:'切换文件架',exact:true})).toContainText('灵感收集');
  await expect(page.getByRole('textbox',{name:'搜索文件',exact:true})).toHaveValue('Alpha');
  await page.getByRole('button',{name:'拆出当前文件架',exact:true}).click();
  await page.getByRole('button',{name:'切换文件架',exact:true}).click();
  await expect(page.locator('.child-window-choice')).toHaveCount(1);
  await expect(page.locator('.child-window-choice')).toContainText('1');
  await expect(page.locator('.child-window-choice')).toContainText('灵感收集');
  await page.getByRole('menuitemradio',{name:'本次中转',exact:true}).click();
  await expect(page.getByRole('menuitemradio',{name:'灵感收集',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'收回子窗口 灵感收集',exact:true}).click();
  await expect(page.getByRole('button',{name:'切换文件架',exact:true})).toContainText('本次中转');
  await expect(page.locator('.child-window-choice')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitemradio',{name:'灵感收集',exact:true})).toHaveCount(0);
});

test("主子窗口底部保留空白横条，最小窗口不产生横向溢出",async({page})=>{
  await page.setViewportSize({width:340,height:320});
  for(const url of ['/tests/harness.html','/tests/harness.html?shelf=1']){
    await page.goto(url);
    await expect(page.locator('.window-status-strip')).toBeVisible();
    await expect(page.locator('.window-status-strip')).toHaveText('');
    const bounds=await page.locator('.window-status-strip').boundingBox();
    expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(320);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(url.includes('shelf=')){
      const name=page.locator('.shelf-switch>span').last();
      expect(await name.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    }
  }
});
