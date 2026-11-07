import {test,expect} from "@playwright/test";

test("三套完整主题跨管理中心、文件架和入口同步，重开保留",async({page,context})=>{
  await page.setViewportSize({width:420,height:520});
  await page.goto("/tests/harness.html");
  const manager=await context.newPage();await manager.goto("/tests/harness.html?manager");
  await manager.setViewportSize({width:1040,height:720});
  const dock=await context.newPage();await dock.goto("/tests/harness.html?desktop-entry&count=1");
  await manager.getByRole("button",{name:"设置",exact:true}).click();
  for(const [theme,fill,background] of [["light","rgb(245, 243, 239)","rgb(255, 255, 255)"],["dark","rgb(25, 30, 40)","rgb(25, 30, 40)"],["blue","rgb(40, 105, 214)","rgb(222, 235, 255)"]] as const){
    await manager.getByRole("combobox",{name:"应用主题"}).selectOption(theme);
    await expect(page.locator(".workstation")).toHaveCSS("background-color",background);
    await expect(manager.locator(".manager-shell")).toHaveCSS("background-color",background);
    await expect(dock.locator(".orb-body").first()).toHaveCSS("background-color",fill);
    await page.getByRole("button",{name:"更多操作",exact:true}).click();
    await page.getByRole("menuitem",{name:"AI 对话",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"AI 对话",exact:true})).toHaveCSS("background-color",background);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog",{name:"跨文件架搜索",exact:true})).toHaveCSS("background-color",background);
    await page.screenshot({path:test.info().outputPath(`${theme}-search.png`),animations:"disabled"});
    await manager.screenshot({path:test.info().outputPath(`${theme}-manager.png`),animations:"disabled"});
    await dock.locator(".orb-body").first().screenshot({path:test.info().outputPath(`${theme}-orb.png`),animations:"disabled"});
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.reload();await dock.reload();
  await expect(page.locator("html")).toHaveClass("blue");
  await expect(dock.locator(".orb-body").first()).toHaveCSS("background-color","rgb(40, 105, 214)");
});

test("旧主题优先于旧球体皮肤，没有主题时迁移旧皮肤且保留原记录",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.evaluate(()=>{localStorage.setItem("ningmao-theme","light");localStorage.setItem("ningmao-orb-appearance-v1","navy-black");});
  await page.goto("/tests/harness.html?desktop-entry&count=1");
  await expect(page.locator(".orb-body")).toHaveCSS("background-color","rgb(245, 243, 239)");
  await page.evaluate(()=>localStorage.removeItem("ningmao-theme"));
  await page.reload();
  await expect(page.locator(".orb-body")).toHaveCSS("background-color","rgb(25, 30, 40)");
  expect(await page.evaluate(()=>localStorage.getItem("ningmao-orb-appearance-v1"))).toBe("navy-black");
});
