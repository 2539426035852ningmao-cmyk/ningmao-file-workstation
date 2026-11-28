import {test,expect} from "@playwright/test";
for(const theme of ["light","dark","blue"])test(`场景导航 ${theme} 最小窗口保留键盘返回`,async({page})=>{
 await page.setViewportSize({width:340,height:320});await page.addInitScript(theme=>localStorage.setItem("ningmao-theme",theme),theme);await page.goto("/tests/harness.html");
 await page.getByRole("button",{name:"更多操作",exact:true}).press("Enter");
 await expect(page.getByRole("menuitem",{name:"粘贴文件",exact:true})).toBeVisible();
 await expect(page.getByRole("menuitemradio",{name:"网格视图",exact:true})).toHaveCount(0);
 const display=page.getByRole("menuitem",{name:"显示与整理",exact:true});await display.focus();await display.press("Enter");
 await expect(display).toHaveAttribute("aria-current","page");
 const menu=page.getByRole("menu",{name:"更多操作",exact:true}),bounds=(await menu.boundingBox())!;
 expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(340);expect(bounds.y+bounds.height).toBeLessThanOrEqual(320);
 const layout=await menu.getByRole("menuitemradio",{name:"详细列表",exact:true}).boundingBox();
 const sort=await menu.getByRole("menuitemradio",{name:"手动顺序",exact:true}).boundingBox();
 expect(await menu.getByRole("separator").evaluateAll((lines,{top,bottom})=>lines.some(line=>{
   const rect=line.getBoundingClientRect();
   return rect.height>0&&rect.y>top&&rect.bottom<bottom;
 }),{top:layout!.y+layout!.height,bottom:sort!.y})).toBe(true);
 await page.getByRole("menuitemradio",{name:"详细列表",exact:true}).click();await expect(page.locator(".asset-row").first()).toBeVisible();
 await expect(page.getByRole("menuitemradio",{name:"详细列表",exact:true})).toBeChecked();
 await page.keyboard.press("Escape");await expect(page.getByRole("button",{name:"更多操作",exact:true})).toBeFocused();
 expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
});
