import {mkdirSync} from "node:fs";
import path from "node:path";
import {test,expect} from "@playwright/test";
for(const width of [340,420])test(`integrated window controls ${width}`,async({page})=>{
 await page.setViewportSize({width,height:520});await page.goto("/tests/harness.html");
 for(const label of ["最小化窗口","最大化窗口","暂时关闭窗口"])await expect(page.getByRole("button",{name:label,exact:true})).toBeVisible();
 const metrics=await page.locator(".shelf-header").evaluate(e=>({height:e.getBoundingClientRect().height,width:e.scrollWidth}));expect(metrics.height).toBe(44);expect(metrics.width).toBeLessThanOrEqual(width);
 if(process.env.ORB_EVIDENCE){mkdirSync(process.env.ORB_EVIDENCE,{recursive:true});await page.screenshot({path:path.join(process.env.ORB_EVIDENCE,`integrated-titlebar-${width}-dark.png`)});}
 await page.getByRole("button",{name:"最大化窗口",exact:true}).click();await expect(page.getByRole("button",{name:"还原窗口",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"还原窗口",exact:true}).click();await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"切换浅色主题",exact:true}).click();await expect(page.locator(".window-controls")).toBeVisible();if(process.env.ORB_EVIDENCE)await page.screenshot({path:path.join(process.env.ORB_EVIDENCE,`integrated-titlebar-${width}-light.png`)});
});

test("normal file surface keeps transparent outer corners and a draggable upper layer",async({page})=>{
 await page.goto("/tests/harness.html");await expect(page.locator("body")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");await expect(page.locator(".workstation")).toHaveCSS("border-radius","20px");
 const layer=page.locator(".shelf-chrome");await expect(layer).toBeVisible();expect(await layer.evaluate(e=>getComputedStyle(e).boxShadow)).not.toBe("none");
 const grip=page.locator(".titlebar-drag-space"),b=(await grip.boundingBox())!;expect(b.width).toBeGreaterThanOrEqual(20);await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+12,b.y+b.height/2);await page.mouse.up();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("move-entry");
});
