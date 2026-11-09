import {expect,test} from "@playwright/test";

const remoteId = "00000000-0000-4000-8000-000000000123";
const sampleName = "Ningmao-本地测试.txt";

test("发送前的文件读取可取消，迟到的摘要不得再次发送邀请",async({page})=>{
  let invites=0;
  await page.addInitScript(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(){
      if(this.name!=="Ningmao-本地测试.txt")return original.call(this);
      return new Promise<ArrayBuffer>((resolve,reject)=>{
        setTimeout(()=>{void original.call(this).then(resolve,reject);},900);
      });
    };
  });
  await page.route("**/api/me",route=>route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({email:"synthetic-only@example.test"})
  }));
  await page.routeWebSocket(/\\/api\\/connect\\?/,ws=>{
    ws.onMessage(raw=>{
      const message=JSON.parse(String(raw)) as {type:string};
      if(message.type==="invite")invites++;
    });
    ws.send(JSON.stringify({type:"presence",devices:[{id:remoteId,name:"测试接收设备"}]}));
  });
  await page.goto("/");
  await expect(page.locator(".preview-status")).toContainText("已连接");
  await page.getByRole("button",{name:"添加本地测试文件，体验准备流程"}).click();
  await page.getByRole("button",{name:/测试接收设备/}).click();
  await page.getByRole("button",{name:"发送文件",exact:true}).click();
  await expect(page.getByRole("button",{name:"取消当前传输"})).toBeVisible();
  await page.getByRole("button",{name:"取消当前传输"}).click();
  await page.waitForTimeout(1300);
  expect(invites).toBe(0);
  await page.getByRole("button",{name:"传输记录",exact:true}).click();
  await expect(page.getByText("已取消",{exact:true})).toBeVisible();
});

test("服务端临时 503 会自动重新验证，不需刷新或假造设备",async({page})=>{
  let attempts=0;
  await page.route("**/api/me",route=>{
    attempts++;
    return route.fulfill({
      status:attempts===1?503:200,contentType:"application/json",
      body:attempts===1?"{}":JSON.stringify({email:"synthetic-only@example.test"})
    });
  });
  await page.routeWebSocket(/\\/api\\/connect\\?/,ws=>{
    ws.send(JSON.stringify({type:"presence",devices:[]}));
  });
  await page.goto("/");
  await expect(page.locator(".connection-warning")).toContainText("连接服务离线");
  await expect(page.locator(".preview-status")).toContainText("已连接",{timeout:12_000});
  expect(attempts).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".connected-device")).toHaveCount(0);
});

test("401 失效身份不会无限自动重试",async({page})=>{
  let attempts=0;
  await page.route("**/api/me",route=>{
    attempts++;
    return route.fulfill({status:401,body:"{}",contentType:"application/json"});
  });
  await page.goto("/");
  await expect(page.locator(".connection-warning")).toContainText("尚未通过 Cloudflare Access");
  await page.waitForTimeout(4000);
  expect(attempts).toBe(1);
});
