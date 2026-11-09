import {expect,test} from "@playwright/test";
const code="nm1i_"+"a".repeat(43);

test("W1 Windows 配对通过现有文件互传面板调用原生接口，不把会话令牌交给网页",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("连接网页 / 手机 · Windows 设备授权（W1）",{exact:true}).click();
  await panel.getByLabel("网页服务 HTTPS 地址").fill("https://test.workers.dev/");
  await panel.getByLabel("Windows 一次性配对码").fill(code);
  await panel.getByRole("button",{name:"绑定 Windows 设备"}).click();
  await expect(panel.getByText("Windows 已获得临时设备授权 · 未联网传文件")).toBeVisible();
  await expect(panel).toContainText("WebRTC 文件通道仍未接入");
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual(["web-device-claim:https://test.workers.dev/:nm1i_"]);
  await panel.getByRole("button",{name:"断开本机授权"}).click();
  await expect(panel.getByRole("button",{name:"绑定 Windows 设备"})).toBeDisabled();
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([
    "web-device-claim:https://test.workers.dev/:nm1i_","web-device-disconnect"
  ]);
});

test("W1 错误配对不会变成已授权状态，仍可安全重试",async({page})=>{
  await page.goto("/tests/harness.html?web-device-error");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("连接网页 / 手机 · Windows 设备授权（W1）",{exact:true}).click();
  await panel.getByLabel("网页服务 HTTPS 地址").fill("https://test.workers.dev/");
  await panel.getByLabel("Windows 一次性配对码").fill(code);
  await panel.getByRole("button",{name:"绑定 Windows 设备"}).click();
  await expect(panel.getByRole("alert")).toContainText("代码已过期");
  await expect(panel.getByText("Windows 已获得临时设备授权 · 未联网传文件")).toHaveCount(0);
  await expect(panel.getByRole("button",{name:"绑定 Windows 设备"})).toBeEnabled();
});
