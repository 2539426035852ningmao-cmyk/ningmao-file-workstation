import { test,expect } from "@playwright/test";
import { mkdirSync,writeFileSync } from "node:fs";
import path from "node:path";
const evidence=process.env.COMPACT_EVIDENCE;
if(evidence)mkdirSync(evidence,{recursive:true});
async function more(page:import("@playwright/test").Page,name:string,radio=false){
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole(radio?"menuitemradio":"menuitem",{name,exact:true}).click();
}
async function capture(page:import("@playwright/test").Page,name:string){if(evidence)await page.screenshot({path:path.join(evidence,name+".png")});}

test("小文件架只有一行主操作，搜索原位展开并恢复焦点",async({page})=>{
  await page.setViewportSize({width:420,height:520});
  await page.goto("/tests/harness.html");
  await expect(page.getByRole("button",{name:"更多操作",exact:true})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"搜索文件",exact:true})).toHaveCount(0);
  const files=await page.getByTestId("file-scroll").boundingBox();
  expect(files!.height).toBeGreaterThan(400);
  await page.getByRole("button",{name:"搜索文件",exact:true}).click();
  const search=page.getByRole("textbox",{name:"搜索文件",exact:true});
  await expect(search).toBeFocused();
  await search.fill("中文");await expect(page.locator("[data-item-id]")).toHaveCount(1);
  await search.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(page.getByRole("button",{name:"搜索文件",exact:true})).toBeFocused();
  await expect(page.locator("[data-item-id]")).toHaveCount(3);
});

for(const [width,height] of [[340,320],[420,520],[640,720]])for(const theme of ["dark","light"]){
  test(`${width}×${height} ${theme} 文件区与菜单不溢出`,async({page})=>{
    await page.setViewportSize({width,height});await page.goto("/tests/harness.html");
    if(theme==="light")await more(page,"切换浅色主题");
    await page.evaluate(()=>window.testHarness.drop(["SYNTHETIC/封面设计 草稿.txt","SYNTHETIC/会议记录.txt","SYNTHETIC/参考资料.txt","SYNTHETIC/素材清单.txt","SYNTHETIC/这是用于验证省略显示且不会撑开浮窗的很长中文文件名.txt"]));
    await expect(page.locator(".status-toast")).toHaveCount(0);
    const geometry=await page.evaluate(()=>{
      const area=document.querySelector('[data-testid="file-scroll"]')!.getBoundingClientRect();
      const header=document.querySelector(".shelf-header")!.getBoundingClientRect();
      const rows=[...document.querySelectorAll("[data-item-id]")].map(n=>n.getBoundingClientRect());
      return {viewport:{width:innerWidth,height:innerHeight},fileHeight:area.height,headerHeight:header.height,columns:new Set(rows.filter(r=>r.top===rows[0].top).map(r=>r.left)).size,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,filenameFont:getComputedStyle(document.querySelector(".asset-name")!).fontSize};
    });
    expect(geometry.horizontalOverflow).toBe(false);expect(geometry.headerHeight).toBe(44);
    expect(geometry.fileHeight).toBeGreaterThan(height*.72);expect(geometry.filenameFont).toBe("13px");
    if(width===420)expect(geometry.columns).toBe(3);if(width===340)expect(geometry.columns).toBe(2);
    await page.getByRole("button",{name:"更多操作",exact:true}).evaluate(n=>n.blur());await page.mouse.move(8,58);
    await capture(page,`${theme}-${width}`);
    if(evidence)writeFileSync(path.join(evidence,`${theme}-${width}.json`),JSON.stringify(geometry,null,2)+"\n");
    await page.getByRole("button",{name:"更多操作",exact:true}).click();
    const menu=page.getByRole("menu",{name:"更多操作",exact:true});
    const box=await menu.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
    if(width===340 && theme==="dark")await capture(page,"menu-340");
    await menu.press("End");await expect(page.getByRole("menuitem",{name:"完整退出",exact:true})).toBeFocused();
    await page.keyboard.press("Escape");await expect(page.getByRole("button",{name:"更多操作",exact:true})).toBeFocused();
  });
}

test("键盘搜索与文件架切换保持原位，列表和缩略图切换可到达末项",async({page})=>{
  await page.setViewportSize({width:420,height:520});await page.goto("/tests/harness.html");
  await page.keyboard.press("Control+f");const search=page.getByRole("textbox",{name:"搜索文件",exact:true});
  await expect(search).toBeFocused();await search.fill("没有这个合成文件");await expect(page.getByText("没有匹配的文件",{exact:true})).toBeVisible();
  await capture(page,"search-empty-420");await search.press("Escape");
  await page.getByRole("button",{name:"切换文件架",exact:true}).press("Enter");
  await page.getByRole("menuitemradio",{name:"本次中转",exact:true}).click();
  await expect(page.getByText("本次中转 · 仅保存引用",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name:"灵感收集",exact:true}).click();
  await page.evaluate(()=>window.testHarness.drop(Array.from({length:40},(_,i)=>`SYNTHETIC/合成${i}.txt`)));
  const scroll=page.getByTestId("file-scroll");
  await more(page,"详细列表",true);await expect(page.locator(".asset-row").first()).toHaveCSS("height","44px");
  await scroll.evaluate(n=>n.scrollTop=n.scrollHeight);await expect(page.getByRole("button",{name:"选择 合成39.txt",exact:true})).toBeVisible();
  await more(page,"网格视图",true);
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitemradio",{name:"大缩略图",exact:true}).click();
  await scroll.evaluate(n=>n.scrollTop=n.scrollHeight);await expect(page.getByRole("button",{name:"选择 合成39.txt",exact:true})).toBeVisible();
  expect(await page.locator("[data-item-id]").count()).toBeLessThan(43);
});

test("最小窗口复制只显示短进度，取消、失败、离线和历史仍可达",async({page})=>{
  await page.setViewportSize({width:340,height:320});await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitem",{name:"绑定文件夹",exact:true}).click();
  await page.getByRole("button",{name:"添加并复制",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"查看复制任务",exact:true})).toHaveCSS("height","28px");
  await expect(page.locator(".status-toast")).toHaveCount(0,{timeout:500});
  await page.evaluate(()=>window.testHarness.hover(true));await expect(page.getByText("释放以复制 · 保留来源",{exact:true})).toBeVisible();
  await capture(page,"copy-340");await page.evaluate(()=>window.testHarness.hover(false));
  await page.getByRole("button",{name:"查看复制任务",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("来源保留");
  await page.getByRole("button",{name:"取消复制",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("已取消");
  await capture(page,"tasks-340");await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:"查看复制任务",exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.testHarness.fail("合成权限错误：来源与已有目标均保留，请检查访问权限后重试"));
  await page.getByRole("button",{name:"添加并复制",exact:true}).click();await expect(page.getByRole("alert")).toContainText("来源与已有目标均保留");
  await expect(page.locator(".status-toast")).toHaveCount(0,{timeout:500});
  await capture(page,"error-340");
  await page.evaluate(()=>window.testHarness.offline(3));await more(page,"刷新文件状态");
  await expect(page.getByText("目录离线，记录已保留 · 恢复目录后刷新",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,"offline-error-340");
  await more(page,"复制任务");await expect(page.getByRole("dialog")).toContainText("已取消");
});
