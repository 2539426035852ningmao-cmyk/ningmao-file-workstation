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
