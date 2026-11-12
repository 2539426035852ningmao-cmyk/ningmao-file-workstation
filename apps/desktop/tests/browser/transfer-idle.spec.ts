import {expect,test,type Page} from "@playwright/test";

async function openTransfer(page:Page){
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"文件互传",exact:true})).toBeVisible();
}
async function visibility(page:Page,value:"visible"|"hidden"){
  // Synthetic visibility event: this measures renderer requests, not native CPU.
  await page.evaluate(value=>{
    Object.defineProperty(document,"visibilityState",{configurable:true,value});
    document.dispatchEvent(new Event("visibilitychange"));
  },value);
}
test("未选文件不展示连接操作或启动附近设备发现，返回后保留选择与发送",async({page},info)=>{
  await page.goto("/tests/harness.html?nearby&browser-share");
  await openTransfer(page);
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByRole("tab",{name:"发送文件",exact:true}).click();
  await expect(panel.getByRole("button",{name:"返回文件架选文件",exact:true})).toBeVisible();
  const metrics={...await page.evaluate(()=>window.transferHarness.reads()),formControls:await panel.locator("form input,form textarea,form button").count()};
  console.log("empty-send",JSON.stringify(metrics));
  await info.attach("empty-send.json",{body:JSON.stringify(metrics),contentType:"application/json"});
  await page.screenshot({path:info.outputPath("empty-send.png")});
  expect(metrics.devices).toBe(0);
  expect(metrics.formControls).toBe(0);
  await panel.getByRole("button",{name:"返回文件架选文件",exact:true}).click();
  await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"发送到设备",exact:true}).click();
  await panel.getByRole("button",{name:"合成接收电脑 · AAAAAA",exact:true}).click();
  await expect(panel.getByRole("button",{name:"确认设备并发送",exact:true})).toBeEnabled();
  await panel.getByRole("button",{name:"关闭文件互传",exact:true}).click();
  await expect(page.getByRole("button",{name:"选择 Alpha.txt",exact:true})).toHaveAttribute("aria-pressed","true");
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([]);
});

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    (window as unknown as {testW1Status:unknown}).testW1Status={device_id:"synthetic",name:"合成 Windows",endpoint:"https://synthetic.invalid",expires_at:Date.now()+86400000,authorized:true,signal_online:false,online_devices:[]};
  });
});
test("设备状态隐藏40秒零轮询，恢复可见立即刷新，关闭后停止",async({page},info)=>{
  await page.clock.install();
  await page.goto("/tests/harness.html");
  await openTransfer(page);
  await expect.poll(()=>page.evaluate(()=>window.transferHarness.reads().status)).toBeGreaterThan(0);
  const initial=await page.evaluate(()=>window.transferHarness.reads().status);
  await page.clock.runFor(40_000);
  const visible=await page.evaluate(()=>window.transferHarness.reads().status);
  await visibility(page,"hidden");
  await page.clock.runFor(40_000);
  const hidden=await page.evaluate(()=>window.transferHarness.reads().status);
  console.log("status-polls",JSON.stringify({visible40s:visible-initial,hidden40s:hidden-visible}));
  await info.attach("status-polls.json",{body:JSON.stringify({visible40s:visible-initial,hidden40s:hidden-visible}),contentType:"application/json"});
  expect(visible-initial).toBe(10);
  expect(hidden-visible).toBe(0);
  await visibility(page,"visible");
  await expect.poll(()=>page.evaluate(()=>window.transferHarness.reads().status)).toBe(hidden+1);
  await page.getByRole("button",{name:"关闭文件互传",exact:true}).click();
  await page.clock.runFor(40_000);
  expect(await page.evaluate(()=>window.transferHarness.reads().status)).toBe(hidden+1);
});

test("慢设备状态请求不会在轮询或恢复可见时重叠",async({page},info)=>{
  await page.clock.install();
  await page.goto("/tests/harness.html?status-delay=9000");
  await openTransfer(page);
  await page.clock.runFor(10_000);
  await page.clock.runFor(12_000);
  await visibility(page,"hidden");await visibility(page,"visible");
  const reads=await page.evaluate(()=>window.transferHarness.reads());
  console.log("slow-status",JSON.stringify(reads));
  await info.attach("slow-status.json",{body:JSON.stringify(reads),contentType:"application/json"});
  expect(reads.maxInFlight).toBe(1);
});
