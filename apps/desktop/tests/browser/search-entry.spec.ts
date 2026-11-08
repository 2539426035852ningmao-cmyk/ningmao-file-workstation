import {test,expect} from "@playwright/test";

test("文件架菜单可搜索且保留选择，独立架使用受限搜索",async({page})=>{
  for(const scoped of [false,true]){
    await page.setViewportSize({width:340,height:320});await page.goto(`/tests/harness.html${scoped?"?shelf=1":""}`);
    await page.getByText("Alpha.txt",{exact:true}).click();
    await page.getByRole("button",{name:"更多操作",exact:true}).click();
    const menu=page.getByRole("menuitem",{name:scoped?"搜索当前文件架":"跨文件架搜索",exact:true});await expect(menu).toBeVisible({timeout:1500});await menu.click();
    const dialog=page.getByRole("dialog",{name:scoped?"搜索当前文件架":"跨文件架搜索",exact:true});
    await expect(dialog).toBeVisible();await expect(dialog.getByRole("textbox",{name:"名称或标签"})).toBeFocused();
    await dialog.getByRole("textbox",{name:"名称或标签"}).fill("Alpha");await expect(dialog.getByRole("listbox").getByRole("option").first()).toContainText("Alpha.txt");
    await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button",{name:"更多操作",exact:true})).toBeFocused();
    await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toHaveAttribute("aria-pressed","true");
  }
});

test("管理中心有可点击搜索入口，Ctrl K不叠加已有搜索",async({page})=>{
  await page.setViewportSize({width:760,height:520});await page.goto("/tests/harness.html?manager");
  const trigger=page.getByRole("button",{name:"跨文件架搜索",exact:true});await expect(trigger).toBeVisible({timeout:1500});await trigger.click();
  const dialog=page.getByRole("dialog",{name:"跨文件架搜索",exact:true});await expect(dialog).toBeVisible();
  await page.keyboard.press("Control+k");await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await trigger.click();await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.screenshot({path:`${process.env.M105_TEST_OUTPUT||"test-results"}/manager-search-entry.png`,animations:"disabled"});
});
