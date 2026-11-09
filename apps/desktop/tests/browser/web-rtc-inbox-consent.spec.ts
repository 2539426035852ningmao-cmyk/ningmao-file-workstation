import {expect,test,type Page} from "@playwright/test";
const browser="18aba838-246f-4d0e-af08-1a27b536932a";
const id="b72ff401-e3a8-41d0-a510-bb57b83c1641";
const code="nm1i_"+"a".repeat(43);
const offer={id,name:"镜头 01.png",size:3,mime:"image/png",sha256:"a".repeat(64)};
async function connected(page:Page){
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("连接网页 / 手机 · Windows 设备授权（W1）",{exact:true}).click();
  await panel.getByLabel("网页服务 HTTPS 地址").fill("https://test.workers.dev/");
  await panel.getByLabel("Windows 一次性配对码").fill(code);
  await panel.getByRole("button",{name:"绑定 Windows 设备"}).click();
  await panel.getByRole("button",{name:"连接网页信令（W1）"}).click();
  await expect(panel.getByText("Windows 原生信令已连接 · 网页接收需手动确认")).toBeVisible();
  const section=panel.getByText("网页 → Windows 文件安全接收（W2/W3）",{exact:true});
  await section.click();
  return panel;
}
async function incoming(page:Page,overrides:Record<string,unknown>={}){
  await page.evaluate(msg=>window.transferHarness.webSignal(msg),{
    type:"invite",from:browser,payload:{...offer,...overrides}
  });
}
test("W2 默认拒收网页文件，不开启接收时绝不创建本机文件",async({page})=>{
  const panel=await connected(page);
  await incoming(page);
  await expect(panel.getByText("来自 Chrome 测试设备")).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.transferHarness.calls())).toContain(
    "web-rtc-signal:decision:"+id+":false"
  );
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls).not.toContain("web-rtc-signal:receipt:"+id+":");
  expect(calls).not.toContain("web-rtc-signal:decision:"+id+":true");
});
test("W2 显示文件清单与人工拒收，禁用自动文件写入",async({page})=>{
  const panel=await connected(page);
  await panel.getByRole("button",{name:"允许网页发送请求（仅当前面板）"}).click();
  await incoming(page);
  await expect(panel.getByRole("region",{name:"等待用户确认的网页文件"})).toBeVisible();
  await expect(panel.getByText("镜头 01.png · 3 B")).toBeVisible();
  await expect(panel.getByRole("button",{name:"确认接收并保存"})).toBeDisabled();
  await panel.getByRole("button",{name:"拒绝网页文件"}).click();
  await expect(panel.getByRole("region",{name:"等待用户确认的网页文件"})).toHaveCount(0);
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls).toContain("web-rtc-enabled:true");
  expect(calls).toContain("web-rtc-signal:decision:"+id+":false");
  expect(calls.some(s=>s.startsWith("web-rtc-signal:receipt"))).toBe(false);
});
test("W3 用户选定真实绑定文件架后才同意 WebRTC，取消不回报保存成功",async({page})=>{
  await page.addInitScript(()=>{
    const state={shelves:[
      {id:1,name:"灵感收集",kind:"persistent",root:null,available:true},
      {id:2,name:"本次中转",kind:"session",root:null,available:true},
      {id:31,name:"我的接收文件夹",kind:"bound",root:"C:/Safe",available:true}
    ],items:[
      {id:1,name:"Alpha.txt",shelf_id:1,path:"SYNTHETIC/Alpha.txt",kind:"txt",bytes:200,modified:1,status:"normal",tags:[]}
    ],jobs:[]};
    localStorage.setItem("test-state",JSON.stringify(state));
  });
  const panel=await connected(page);
  await panel.getByRole("button",{name:"允许网页发送请求（仅当前面板）"}).click();
  await incoming(page);
  await panel.getByLabel("网页文件保存架").selectOption("31");
  await panel.getByRole("button",{name:"确认接收并保存"}).click();
  await expect.poll(()=>page.evaluate(()=>window.transferHarness.calls())).toContain(
    "web-rtc-signal:decision:"+id+":true"
  );
  await expect(panel.getByRole("button",{name:"取消当前网页传输"})).toBeVisible();
  await panel.getByRole("button",{name:"取消当前网页传输"}).click();
  await expect(panel).toContainText("已取消，临时接收已停止");
  const calls=await page.evaluate(()=>window.transferHarness.calls());
  expect(calls).toContain("web-rtc-signal:cancel:"+id+":");
  expect(calls.some(s=>s.startsWith("web-rtc-signal:receipt"))).toBe(false);
});


test("W2 本地真实 RTCDataChannel → W3 原生保存模拟，仅持久化完成后才回执",async({page})=>{
  test.setTimeout(70_000);
  await page.addInitScript(()=>{
    localStorage.setItem("test-state",JSON.stringify({
      shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},
        {id:2,name:"本次中转",kind:"session",root:null,available:true},
        {id:31,name:"我的接收文件夹",kind:"bound",root:"C:/Safe",available:true}],
      items:[{id:1,name:"Alpha.txt",shelf_id:1,path:"SYNTHETIC/Alpha.txt",
        kind:"txt",bytes:200,modified:1,status:"normal",tags:[]}],jobs:[]
    }));
  });
  const panel=await connected(page);
  await panel.getByRole("button",{name:"允许网页发送请求（仅当前面板）"}).click();
  await page.evaluate(async({browser,id})=>{
    const bytes=new TextEncoder().encode("柠猫 W2-WebRTC → W3-Windows Store synthetic");
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))
      .map(v=>v.toString(16).padStart(2,"0")).join("");
    const pc=new RTCPeerConnection({iceServers:[]});
    const channel=pc.createDataChannel("ningmao-transfer",{ordered:true});
    const pending:RTCIceCandidateInit[]=[];
    window.transferHarness.mockWebNativeSave();
    pc.onicecandidate=e=>{
      if(e.candidate)window.transferHarness.webSignal({type:"candidate",from:browser,
        payload:{id,candidate:e.candidate.toJSON()}});
    };
    channel.onopen=()=>{
      channel.send(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
      channel.send("DONE");
    };
    window.transferHarness.onWebOutbound(message=>{
      if(message.type==="decision"&&message.payload.accepted===true){
        void (async()=>{
          await pc.setLocalDescription(await pc.createOffer());
          window.transferHarness.webSignal({type:"description",from:browser,
            payload:{id,description:pc.localDescription!.toJSON()}});
        })();
      }else if(message.type==="description"){
        void (async()=>{
          await pc.setRemoteDescription(message.payload.description as RTCSessionDescriptionInit);
          for(const candidate of pending.splice(0))await pc.addIceCandidate(candidate);
        })();
      }else if(message.type==="candidate"){
        const ice=message.payload.candidate as RTCIceCandidateInit;
        if(pc.remoteDescription)void pc.addIceCandidate(ice);
        else pending.push(ice);
      }
      if(message.type==="receipt")void pc.close();
    });
    window.transferHarness.webSignal({type:"invite",from:browser,payload:{
      id,name:"received-window-test.txt",size:bytes.byteLength,
      mime:"text/plain",sha256:digest
    }});
  },{browser,id});
  await expect(panel.getByText("received-window-test.txt",{exact:false})).toBeVisible();
  await panel.getByLabel("网页文件保存架").selectOption("31");
  await panel.getByRole("button",{name:"确认接收并保存"}).click();
  await expect.poll(()=>page.evaluate(()=>window.transferHarness.nativeWebCalls()),{timeout:35_000})
    .toContain("web_receive_finish");
  const native=await page.evaluate(()=>window.transferHarness.nativeWebCalls());
  expect(native).toEqual(["web_receive_prepare","web_receive_append","web_receive_finish"]);
  const outgoing=await page.evaluate(()=>window.transferHarness.calls());
  expect(outgoing).toContain("web-rtc-signal:receipt:"+id+":");
  await expect(panel).toContainText("已保存到 Windows 文件架");
});
