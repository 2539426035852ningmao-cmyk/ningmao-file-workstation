import {expect,test,type Page} from "@playwright/test";

const browserId="18aba838-246f-4d0e-af08-1a27b536932a";
const code="nm1i_"+"a".repeat(43);

async function openOutbox(page:Page,query=""){
  await page.goto("/tests/harness.html"+query);
  await page.getByText("Alpha.txt",{exact:true}).click();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"发送到设备",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("连接网页 / 手机 · Windows 设备授权（W1）",{exact:true}).click();
  await panel.getByLabel("网页服务 HTTPS 地址").fill("https://test.workers.dev/");
  await panel.getByLabel("Windows 一次性配对码").fill(code);
  await panel.getByRole("button",{name:"绑定 Windows 设备"}).click();
  await panel.getByRole("button",{name:"连接网页信令（W1）"}).click();
  await expect(panel.getByText("Windows 原生信令已连接 · 网页接收需手动确认")).toBeVisible();
  await panel.getByText("Windows → 网页 / 手机 · 安全发送（W2/W3）",{exact:true}).click();
  await panel.getByLabel("接收网页设备").selectOption(browserId);
  return panel;
}

test("Windows 已选文件通过 WebRTC 到浏览器验证，回执不冒称已保存",async({page})=>{
  test.setTimeout(70_000);
  const panel=await openOutbox(page);
  await page.evaluate(()=>window.transferHarness.installSyntheticBrowserReceiver());
  await panel.getByRole("button",{name:"发送到已选网页设备"}).click();
  await expect(panel.getByText("对方已校验文件；浏览器仍需手动点击保存。")).toBeVisible({timeout:35_000});
  expect(await page.evaluate(()=>window.transferHarness.receivedBrowserFile()))
    .toBe("Ningmao Windows to browser synthetic source");
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls).toContain("web-rtc-source:1:1");
  expect(calls.some(v=>v.startsWith("web-rtc-signal:invite:"))).toBe(true);
  expect(calls.some(v=>v.startsWith("web-rtc-signal:description:"))).toBe(true);
  expect(calls.some(v=>v.startsWith("web-rtc-signal:receipt:"))).toBe(false);
});

test("网页用户拒绝时立即结束，来源保留且无发送通道",async({page})=>{
  const panel=await openOutbox(page);
  await panel.getByRole("button",{name:"发送到已选网页设备"}).click();
  await expect.poll(async()=> (await page.evaluate(()=>window.transferHarness.calls()))
    .find(v=>v.startsWith("web-rtc-signal:invite:"))).toBeTruthy();
  const id=(await page.evaluate(()=>window.transferHarness.calls()))
    .find(v=>v.startsWith("web-rtc-signal:invite:"))!.split(":")[2];
  await page.evaluate(({from,id})=>window.transferHarness.webSignal({
    type:"decision",from,payload:{id,accepted:false}
  }),{from:browserId,id});
  await expect(panel.getByText("接收方已拒绝，本机原文件保持不变")).toBeVisible();
  await expect(panel.getByRole("button",{name:"发送到已选网页设备"})).toBeEnabled();
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls.some(v=>v.startsWith("web-rtc-signal:description:"))).toBe(false);
});

test("用户取消等待接收确认，发送取消信令且不产生成功回执",async({page})=>{
  const panel=await openOutbox(page);
  await panel.getByRole("button",{name:"发送到已选网页设备"}).click();
  await expect.poll(async()=> (await page.evaluate(()=>window.transferHarness.calls()))
    .find(v=>v.startsWith("web-rtc-signal:invite:"))).toBeTruthy();
  await panel.getByRole("button",{name:"取消本次网页发送"}).click();
  await expect(panel.getByText("已取消网页发送，原文件未修改")).toBeVisible();
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls.some(v=>v.startsWith("web-rtc-signal:cancel:"))).toBe(true);
  expect(calls.some(v=>v.startsWith("web-rtc-signal:receipt:"))).toBe(false);
});

test("Windows 原生文件源失败，绝不能邀请网页接收",async({page})=>{
  const panel=await openOutbox(page,"?web-outbox-source-error");
  await panel.getByRole("button",{name:"发送到已选网页设备"}).click();
  await expect(panel.getByRole("alert")).toContainText("合成文件源校验失败");
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls).toContain("web-rtc-source:1:1");
  expect(calls.some(v=>v.startsWith("web-rtc-signal:invite:"))).toBe(false);
});
