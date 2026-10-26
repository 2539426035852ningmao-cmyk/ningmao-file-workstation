import {test,expect} from "@playwright/test";
test("全局唤出只在管理设置配置，冲突不覆盖旧键，支持暂停与重载恢复",async({page})=>{
 await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"设置",exact:true}).click();
 await expect(page.getByRole("checkbox",{name:"启用全局唤出快捷键",exact:true})).toBeChecked();await expect(page.getByText("当前：Ctrl+Alt+Space",{exact:true})).toBeVisible();
 await page.getByRole("combobox",{name:"快捷键组合"}).selectOption("Ctrl+Shift");await page.getByRole("combobox",{name:"快捷键按键"}).selectOption("F9");await page.evaluate(()=>window.testHarness.fail("快捷键已被占用，原设置保持。"));await page.getByRole("button",{name:"保存快捷键",exact:true}).click();await expect(page.getByRole("alert")).toContainText("快捷键已被占用");await expect(page.getByText("当前：Ctrl+Alt+Space",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"保存快捷键",exact:true}).click();await expect(page.getByText("当前：Ctrl+Shift+F9",{exact:true})).toBeVisible();await page.getByRole("button",{name:"暂停快捷键",exact:true}).click();await expect(page.getByText("快捷键已暂停",{exact:true})).toBeVisible();await page.getByRole("button",{name:"恢复快捷键",exact:true}).click();await expect(page.getByText("当前：Ctrl+Shift+F9",{exact:true})).toBeVisible();
 await page.reload();await page.getByRole("button",{name:"设置",exact:true}).click();await expect(page.getByRole("combobox",{name:"快捷键按键"})).toHaveValue("F9");
 await page.getByRole("checkbox",{name:"启用全局唤出快捷键",exact:true}).uncheck();await page.getByRole("button",{name:"保存快捷键",exact:true}).click();await expect(page.getByText("快捷键已关闭",{exact:true})).toBeVisible();
});

test("快捷键回退失败时显示后端真实不可用状态，不沿用旧注册成功画面",async({page})=>{
 await page.goto("/tests/harness.html?manager&wake-inactive-after-failure");await page.getByRole("button",{name:"设置",exact:true}).click();await expect(page.getByText("当前：Ctrl+Alt+Space",{exact:true})).toBeVisible();await page.getByRole("combobox",{name:"快捷键按键"}).selectOption("F9");await page.evaluate(()=>window.testHarness.fail("设置未保存且回退失败；快捷键已停用。"));await page.getByRole("button",{name:"保存快捷键",exact:true}).click();await expect(page.getByText("快捷键未注册，仍可通过托盘打开",{exact:true})).toBeVisible();await expect(page.getByText("当前：Ctrl+Alt+Space",{exact:true})).toHaveCount(0);await expect(page.getByRole("combobox",{name:"快捷键按键"})).toHaveValue("F9");
});

test("屏幕外窗口恢复只从管理设置主动请求，不改变文件记录",async({page})=>{
 await page.goto("/tests/harness.html?manager");await page.getByRole("button",{name:"设置",exact:true}).click();const before=await page.evaluate(()=>localStorage.getItem("test-state"));await page.getByRole("button",{name:"找回屏幕外窗口",exact:true}).click();await expect(page.getByRole("status")).toHaveText("窗口已在可见屏幕内。");expect(await page.evaluate(()=>window.testHarness.calls())).toContain("recover-windows");expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(before);
});
