import {expect,test,type BrowserContext,type WebSocketRoute} from "@playwright/test";
import {readFile} from "node:fs/promises";

/** Synthetic Worker signaling route ONLY inside Playwright.
 * This test deliberately does not bypass real Access verification in production.
 */
test("统一界面：两独立浏览器合成登录→选择设备→确认→SHA 校验→下载保存", async ({browser}) => {
  const peers=new Map<string,{route:WebSocketRoute;name:string}>();
  const broadcast=()=>{
    const devices=[...peers].map(([id,p])=>({id,name:p.name}));
    const payload=JSON.stringify({type:"presence",devices});
    for(const peer of peers.values()) peer.route.send(payload);
  };
  const configure=async(context:BrowserContext)=>{
    await context.route("**/api/me",route=>route.fulfill({
      status:200,contentType:"application/json",
      body:JSON.stringify({id:"synthetic-test-subject",email:"test-only@example.test"})
    }));
    await context.routeWebSocket(/\/api\/connect\?/,ws=>{
      const url=new URL(ws.url());
      const id=url.searchParams.get("device")||"";
      const name=url.searchParams.get("name")||"";
      peers.set(id,{route:ws,name});
      ws.onMessage(raw=>{
        const message=JSON.parse(String(raw)) as {type:string;to?:string;payload?:{id?:string}};
        if(message.type==="ping"){ws.send(JSON.stringify({type:"pong"}));return;}
        const remote=peers.get(message.to??"");
        if(!remote){ws.send(JSON.stringify({type:"unavailable",to:message.to,id:message.payload?.id}));return;}
        remote.route.send(JSON.stringify({type:message.type,from:id,payload:message.payload}));
      });
      ws.onClose(()=>{
        if(peers.get(id)?.route===ws) peers.delete(id);
        broadcast();
      });
      broadcast();
    });
  };
  const contexts=[await browser.newContext(),await browser.newContext()];
  try {
    await Promise.all(contexts.map(configure));
    const [sender,receiver]=await Promise.all(contexts.map(c=>c.newPage()));
    await Promise.all([sender.goto("/"),receiver.goto("/")]);
    await expect(sender.locator(".preview-status")).toContainText("已连接");
    await expect(receiver.locator(".preview-status")).toContainText("已连接");
    broadcast();
    await expect(sender.locator(".connected-device")).toHaveCount(1);
    await expect(receiver.locator(".connected-device")).toHaveCount(1);
    await sender.getByRole("button",{name:"添加本地测试文件，体验准备流程"}).click();
    await sender.locator(".connected-device").click();
    const send=sender.getByRole("button",{name:"发送文件",exact:true});
    await expect(send).toBeEnabled();
    await send.click();
    const dialog=receiver.getByRole("dialog",{name:"收到文件请求"});
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Ningmao-本地测试.txt");
    await dialog.getByRole("button",{name:"接受文件"}).click();
    const save=receiver.getByRole("link",{name:"保存"});
    await expect(save).toBeVisible({timeout:25_000});
    await expect(sender.getByText("对方已校验（需自行保存）")).toBeVisible();
    const downloadPromise=receiver.waitForEvent("download");
    await save.click();
    const downloaded=await downloadPromise;
    expect(downloaded.suggestedFilename()).toBe("Ningmao-本地测试.txt");
    const path=await downloaded.path();
    expect(path).not.toBeNull();
    const content=await readFile(path!,"utf8");
    expect(content).toContain("Ningmao 本地合成样例");
    expect(content).toContain("本文件没有上传至服务器");
  } finally {
    await Promise.all(contexts.map(c=>c.close()));
  }
});
