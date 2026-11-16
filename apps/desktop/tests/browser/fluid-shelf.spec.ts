import {test,expect} from "@playwright/test";

test("表情单击收回 右键直接选择完整主题",async({page})=>{
  await page.goto("/tests/harness.html");
  const face=page.getByRole("button",{name:"表情 收起文件架",exact:true});
  await face.click({button:"right"});
  await page.getByRole("menuitemradio",{name:"白色主题",exact:true}).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem("ningmao-theme"))).toBe("light");
  await face.click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("collapse:1");
});
