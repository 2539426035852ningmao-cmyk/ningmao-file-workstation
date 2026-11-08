import {test,expect} from '@playwright/test';

for(const theme of ['light','dark','blue'])test(`显示设置收进原位展开，${theme}最小窗口保留键盘返回`,async({page})=>{
 await page.setViewportSize({width:340,height:320});await page.addInitScript(theme=>localStorage.setItem('ningmao-theme',theme),theme);await page.goto('/tests/harness.html');
 await page.getByRole('button',{name:'更多操作',exact:true}).press('Enter');
 await expect(page.getByRole('menuitem',{name:'粘贴文件',exact:true})).toBeVisible();
 await expect(page.getByRole('menuitemradio',{name:'网格视图',exact:true})).toHaveCount(0);
 const display=page.getByRole('menuitem',{name:'显示与排序',exact:true});await expect(display).toHaveAttribute('aria-expanded','false');
 await display.focus();await page.keyboard.press('Enter');
 await expect(display).toHaveAttribute('aria-expanded','true');const submenu=page.getByRole('menu',{name:'更多操作',exact:true});await expect(submenu).toBeVisible();
 const bounds=await submenu.boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(340);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(320);
 await page.getByRole('menuitemradio',{name:'详细列表',exact:true}).click();await expect(page.locator('.asset-row').first()).toBeVisible();
 await page.getByRole('button',{name:'更多操作',exact:true}).click();await display.focus();await page.keyboard.press('Enter');await expect(page.getByRole('menuitemradio',{name:'详细列表',exact:true})).toBeChecked();
 await page.screenshot({path:`test-results/menu-group-${theme}.png`,animations:'disabled'});
 await display.focus();await page.keyboard.press('Enter');await expect(display).toHaveAttribute('aria-expanded','false');await expect(display).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'更多操作',exact:true})).toBeFocused();
 expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
});
