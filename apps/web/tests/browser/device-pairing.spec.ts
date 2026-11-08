import {expect,test} from "@playwright/test";
const code="nm1i_"+"b".repeat(43);
const id="28560890-e97d-4fab-83c8-937b816d10cd";

test("W1 browser: authenticated account can issue one-use code and revoke a paired Windows device",async({page})=>{
  let revoked=false;
  await page.route("**/api/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:"synthetic-owner",email:"synthetic@example.test"})}));
  await page.route("**/api/devices",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
    devices:revoked?[]:[{id,name:"Windows 测试设备",expires_at:Date.now()+3600000}]
  })}));
  await page.route("**/api/device-invites",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({code,expires_at:Date.now()+120000})}));
  await page.route("**/api/devices/revoke",route=>{
    expect(route.request().method()).toBe("POST");
    expect(JSON.parse(route.request().postData()??"{}")).toEqual({id});
    revoked=true;
    return route.fulfill({status:200,contentType:"application/json",body:'{"removed":true}'});
  });
  await page.goto("/");
  await page.getByRole("button",{name:"我的设备"}).click();
  const panel=page.getByRole("region",{name:"Windows 工作站网页授权"});
  await expect(panel.getByText("Windows 测试设备")).toBeVisible();
  await panel.getByRole("button",{name:"生成 Windows 配对码"}).click();
  await expect(panel.getByLabel("Windows 一次性配对码")).toHaveText(code);
  await expect(panel).toContainText("只能在两分钟内使用一次");
  await panel.getByRole("button",{name:"撤销授权"}).click();
  await expect(panel.getByRole("button",{name:"确认撤销"})).toBeVisible();
  await panel.getByRole("button",{name:"确认撤销"}).click();
  await expect(panel.getByText("Windows 测试设备")).toHaveCount(0);
  await expect(panel).toContainText("设备授权已撤销");
});
test("W1 browser: no Access identity means no pairing credential can be minted",async({page})=>{
  await page.route("**/api/me",route=>route.fulfill({status:401,contentType:"application/json",body:'{"error":"unauthorized"}'}));
  await page.goto("/");
  await page.getByRole("button",{name:"我的设备"}).click();
  const panel=page.getByRole("region",{name:"Windows 工作站网页授权"});
  await expect(panel.getByRole("button",{name:"生成 Windows 配对码"})).toBeDisabled();
  await expect(panel).toContainText("需要先通过 Cloudflare Access 登录");
});
