import {expect,test} from "@playwright/test";

test("W3 原有 Windows 互传面板可预检选中本机文件，明确不等于联网发送",async({page})=>{
  await page.goto("/tests/harness.html?web-preflight");
  await page.getByText("Alpha.txt",{exact:true}).click();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"发送到设备",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("网页 / 手机互传 · W3 本机准备检查",{exact:true}).click();
  await panel.getByRole("button",{name:"校验选中文件（本机）"}).click();
  await expect(panel.getByText("本机文件已校验 · 尚未发送")).toBeVisible();
  await expect(panel.getByText("SHA-256：")).toContainText("SHA-256");
  await expect(panel.locator(".transfer-hash")).toHaveText("a".repeat(64));
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls).toEqual(["web-preflight:1:1"]);
  await expect(panel.getByRole("button",{name:"发送文件",exact:true})).toBeDisabled();
});

test("W3 本机来源引用变更，不将预检失败显示为成功发送",async({page})=>{
  await page.goto("/tests/harness.html?web-preflight-error");
  await page.getByText("Alpha.txt",{exact:true}).click();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"发送到设备",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("网页 / 手机互传 · W3 本机准备检查",{exact:true}).click();
  await panel.getByRole("button",{name:"校验选中文件（本机）"}).click();
  await expect(panel.getByRole("alert")).toContainText("文件引用已变化");
  await expect(panel.getByText("本机文件已校验 · 尚未发送")).toHaveCount(0);
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual(["web-preflight:1:1"]);
});
