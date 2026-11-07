import {test,expect} from "@playwright/test";

test("Ctrl K 不在已有工作面板上叠加搜索，关闭后可正常搜索",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"AI 对话",exact:true}).click();
  const chat=page.getByRole("dialog",{name:"AI 对话",exact:true});
  await expect(chat).toBeVisible();
  await chat.getByRole("textbox",{name:"消息",exact:true}).fill("尚未发送的草稿");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(chat).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog",{name:"跨文件架搜索",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"AI 对话",exact:true}).click();
  await expect(chat.getByRole("textbox",{name:"消息",exact:true})).toHaveValue("尚未发送的草稿");
});

test("管理中心仅三个一级栏目，文件架素材标签均保留",async({page})=>{
  await page.goto("/tests/harness.html?manager");
  const nav=page.getByRole("navigation",{name:"管理中心导航"});
  await expect(nav.getByRole("button")).toHaveText(["文件与素材","任务中心","设置"]);
  await expect(page.getByRole("button",{name:/灵感收集/})).toBeVisible();
  await page.getByRole("button",{name:"素材",exact:true}).click();
  await expect(nav.getByRole("button",{name:"文件与素材",exact:true})).toHaveAttribute("aria-current","page");
  await page.getByRole("checkbox",{name:"选择 Alpha.txt",exact:true}).check();
  await page.getByRole("textbox",{name:"标签名称",exact:true}).fill("合成标签");
  await page.getByRole("button",{name:"添加标签",exact:true}).click();
  await page.getByRole("button",{name:"标签",exact:true}).click();
  await page.getByRole("button",{name:"合成标签 1 项",exact:true}).click();
  await expect(page.getByRole("checkbox",{name:"选择 Alpha.txt",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"任务中心",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"任务状态"})).toBeVisible();
});
