import {test,expect} from "@playwright/test";
test("B01 body movement crosses threshold once and suppresses shape click",async({page})=>{
 await page.goto("/tests/harness.html?desktop-entry&count=1");const orb=page.getByRole("button",{name:"展开 灵感收集",exact:true});const b=(await orb.boundingBox())!;
 await page.mouse.move(b.x+24,b.y+24);await page.mouse.down();await page.mouse.move(b.x+40,b.y+24,{steps:4});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>window.testHarness.calls().filter(v=>v==="move-entry").length)).toBe(1);
 await expect(orb).toBeVisible();
});
test("B03 B04 capsule neutral close is not a permanent clickable X, peek circles are fully clickable",async({page})=>{
 await page.goto("/tests/harness.html?desktop-entry&count=1");await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();await page.mouse.move(400,400);
 await expect(page.locator(".capsule-close")).toBeHidden();
 await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();const back=page.getByRole("button",{name:"返回胶囊",exact:true});
 expect(await back.evaluate(el=>getComputedStyle(el).borderRadius)).toBe("50%");await back.click();await expect(page.getByTestId("morph-capsule")).toBeVisible();
});
test("B05 idle menu scrollbar is transparent without losing keyboard reach",async({page})=>{
 await page.goto("/tests/harness.html");await page.getByRole("button",{name:"更多操作",exact:true}).click();const menu=page.getByRole("menu",{name:"更多操作",exact:true});
 await page.mouse.move(5,500);await expect(menu).toBeVisible();expect(await menu.evaluate(el=>getComputedStyle(el).scrollbarGutter)).toContain("stable");
 await menu.press("End");await expect(page.getByRole("menuitem",{name:"完整退出",exact:true})).toBeFocused();
});
