import {expect,test} from "@playwright/test";

const target="18aba838-246f-4d0e-af08-1a27b536932a";
const code="nm1i_"+"a".repeat(43);

test("Worker reports unreachable receiver: only matching Windows send terminates",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.getByText("Alpha.txt",{exact:true}).click();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"发送到设备",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("连接网页 / 手机 · Windows 设备授权（W1）",{exact:true}).click();
  await panel.getByLabel("网页服务 HTTPS 地址").fill("https://test.workers.dev/");
  await panel.getByLabel("Windows 一次性配对码").fill(code);
  await panel.getByRole("button",{name:"绑定 Windows 设备"}).click();
  await panel.getByRole("button",{name:"连接网页信令（W1）"}).click();
  await panel.getByText("Windows → 网页 / 手机 · 安全发送（W2/W3）",{exact:true}).click();
  await panel.getByLabel("接收网页设备").selectOption(target);
  await panel.getByRole("button",{name:"发送到已选网页设备"}).click();
  await expect.poll(async()=> (await page.evaluate(()=>window.transferHarness.calls()))
    .some(v=>v.startsWith("web-rtc-signal:invite:"))).toBe(true);
  const invite=(await page.evaluate(()=>window.transferHarness.calls()))
    .find(v=>v.startsWith("web-rtc-signal:invite:"))!;
  const id=invite.split(":")[2];
  await page.evaluate(({id})=>window.transferHarness.webSignal({
    type:"unavailable",id,to:"b72ff401-e3a8-41d0-a510-bb57b83c1641"
  }),{id});
  await expect(panel.getByRole("button",{name:"取消本次网页发送"})).toBeVisible();
  await page.evaluate(({id,to})=>window.transferHarness.webSignal({type:"unavailable",id,to}),{id,to:target});
  await expect(panel.getByRole("alert")).toContainText("目标网页设备已离线");
  await expect(panel.getByRole("button",{name:"发送到已选网页设备"})).toBeEnabled();
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls.some(v=>v.startsWith("web-rtc-signal:receipt:"))).toBe(false);
});
