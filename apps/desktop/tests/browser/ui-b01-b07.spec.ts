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

test("B06 reference recycle and undo preserve item identity",async({page})=>{
 await page.goto("/tests/harness.html");await page.getByText("Alpha.txt",{exact:true}).first().click({button:"right"});await page.getByRole("menuitem",{name:"移入柠猫回收站（保留原文件）"}).click();
 await expect(page.getByText("Alpha.txt",{exact:true})).toHaveCount(0);await page.getByRole("button",{name:"撤销",exact:true}).click();await expect(page.getByText("Alpha.txt",{exact:true}).first()).toBeVisible();
});
test("B07 last shelf can be recycled and restored from global drawer",async({page})=>{
 await page.goto("/tests/harness.html");for(const name of ["灵感收集","本次中转"]){await page.getByRole("button",{name:"切换文件架"}).click();await page.getByRole("button",{name:`回收文件架 ${name}`,exact:true}).focus();await page.getByRole("button",{name:`回收文件架 ${name}`,exact:true}).click();await page.keyboard.press("Escape");}
 await expect(page.getByText("主窗口暂无文件架",{exact:true})).toBeVisible();await page.getByRole("button",{name:"从回收站恢复"}).click();await expect(page.getByRole("heading",{name:"柠猫回收站"})).toBeVisible();await expect(page.getByRole("button",{name:"恢复",exact:true})).toHaveCount(2);await page.getByRole("button",{name:"恢复",exact:true}).first().click();await page.keyboard.press("Escape");await expect(page.getByText("Alpha.txt",{exact:true}).first()).toBeVisible();
});
test("B06 system recycle preview is distinct and cancellation preserves rows",async({page})=>{
 await page.goto("/tests/harness.html");await page.getByText("Alpha.txt",{exact:true}).first().click();await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"将选中真实文件移入 Windows 回收站…"}).click();await expect(page.getByText("SYNTHETIC/Alpha.txt",{exact:true})).toBeVisible();await page.getByRole("button",{name:"继续并再次确认"}).click();await expect(page.getByText("合成对照：用户取消，文件及引用保留。")).toBeVisible();await page.getByRole("button",{name:"完成",exact:true}).click();await expect(page.getByText("Alpha.txt",{exact:true}).first()).toBeVisible();
});

test("B04 neutral protrusion cannot close until red core is reached",async({page})=>{
 await page.goto("/tests/harness.html?desktop-entry&count=1");await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();const body=page.getByTestId("morph-capsule"),b=(await body.boundingBox())!;
 await page.mouse.move(b.x+b.width-12,b.y+19);await expect(page.locator(".capsule-extrusion")).toHaveAttribute("data-active","false");await expect(page.locator(".capsule-close")).toBeDisabled();
 await page.mouse.move(b.x+b.width-12,b.y+4);await expect(page.locator(".capsule-close")).toBeEnabled();await page.locator(".capsule-close").click();await expect(page.getByRole("button",{name:"展开 灵感收集",exact:true})).toBeVisible();
});
test("B02 current eye pose stays fixed throughout window movement",async({page})=>{
 await page.goto("/tests/harness.html?desktop-entry&count=1");const orb=page.getByRole("button",{name:"展开 灵感收集",exact:true}),b=(await orb.boundingBox())!;await page.mouse.move(b.x+40,b.y+20);const eyes=page.locator(".orb-face");await expect.poll(()=>eyes.evaluate(el=>parseFloat((el as SVGElement).style.getPropertyValue("--gaze-x")))).toBeGreaterThan(.1);
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent("ningmao-window-motion",{detail:true}));});const frozen=await eyes.getAttribute("style");await page.mouse.move(b.x+10,b.y+40);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await eyes.getAttribute("style")).toBe(frozen);await page.evaluate(()=>window.dispatchEvent(new CustomEvent("ningmao-window-motion",{detail:false})));await page.mouse.move(b.x+9,b.y+39);await expect.poll(()=>eyes.getAttribute("style")).not.toBe(frozen);
});
test("B06 multi-selection recycle can undo the complete group",async({page})=>{
 await page.goto("/tests/harness.html");await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();await page.getByRole("button",{name:"选择 Gamma.txt",exact:true}).click({modifiers:["Control"]});await page.locator(".file-scroll").focus();await page.keyboard.press("Delete");await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toHaveCount(0);await page.getByRole("button",{name:"撤销",exact:true}).click();await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"选择 Gamma.txt",exact:true})).toBeVisible();
});
