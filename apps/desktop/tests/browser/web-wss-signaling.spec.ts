import {expect,test} from "@playwright/test";
const code="nm1i_"+"a".repeat(43);
async function pair(page:import("@playwright/test").Page){
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("连接网页 / 手机 · Windows 设备授权（W1）",{exact:true}).click();
  await panel.getByLabel("网页服务 HTTPS 地址").fill("https://test.workers.dev/");
  await panel.getByLabel("Windows 一次性配对码").fill(code);
  await panel.getByRole("button",{name:"绑定 Windows 设备"}).click();
  await expect(panel.getByText("Windows 已获得临时设备授权 · 未联网传文件")).toBeVisible();
  return panel;
}
test("W1 Windows 原生 WSS 状态与文件未联通状态严格分离",async({page})=>{
  await page.goto("/tests/harness.html");
  const panel=await pair(page);
  await panel.getByRole("button",{name:"连接网页信令（W1）"}).click();
  await expect(panel.getByText("Windows 原生信令已连接 · 文件互传尚未接线")).toBeVisible();
  await expect(panel.getByText(/其他在线设备：1 台/)).toBeVisible();
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([
    "web-device-claim:https://test.workers.dev/:nm1i_","web-device-connect"
  ]);
  await panel.getByRole("button",{name:"断开本机授权"}).click();
  await expect(panel.getByRole("button",{name:"绑定 Windows 设备"})).toBeDisabled();
  expect(await page.evaluate(()=>window.transferHarness.calls())).toContain("web-device-disconnect");
});
test("W1 WSS 拒绝时不伪造在线设备或文件成功",async({page})=>{
  await page.goto("/tests/harness.html?web-wss-error");
  const panel=await pair(page);
  await panel.getByRole("button",{name:"连接网页信令（W1）"}).click();
  await expect(panel.getByRole("alert")).toContainText("WSS 授权拒绝");
  await expect(panel.getByText("Windows 原生信令已连接 · 文件互传尚未接线")).toHaveCount(0);
  await expect(panel.getByText("Windows 已获得临时设备授权 · 未联网传文件")).toBeVisible();
  await expect(panel.getByText(/其他在线设备：0 台/)).toBeVisible();
});
