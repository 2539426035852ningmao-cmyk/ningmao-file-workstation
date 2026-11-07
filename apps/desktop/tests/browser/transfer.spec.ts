import {expect,test} from "@playwright/test";

for(const theme of ["light","dark"])test(`互传分区与键盘切换适配340×320 ${theme}`,async({page},info)=>{
  await page.setViewportSize({width:340,height:320});
  await page.goto("/tests/harness.html");
  await page.evaluate(theme=>document.documentElement.classList.toggle("dark",theme==="dark"),theme);
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  const receive=panel.getByRole("tab",{name:"接收文件",exact:true});
  await receive.focus();await page.keyboard.press("ArrowLeft");
  await expect(panel.getByRole("tab",{name:"发送文件",exact:true})).toHaveAttribute("aria-selected","true");
  await expect(panel.getByRole("tabpanel")).toContainText("先在文件架选择文件");
  await panel.getByText("手动连接 / 查看设备信息",{exact:true}).click();
  await panel.getByLabel("证书指纹",{exact:true}).fill("a".repeat(64));
  await expect(panel.getByLabel("证书指纹",{exact:true})).toHaveValue("a".repeat(64));
  const send=panel.getByRole("button",{name:"发送文件",exact:true});
  await send.scrollIntoViewIfNeeded();await expect(send).toBeInViewport();await expect(send).toBeDisabled();
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  expect(await panel.getByRole("tabpanel").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`transfer-${theme}.png`)});
  await panel.getByRole("tab",{name:"发送文件",exact:true}).focus();await page.keyboard.press("ArrowRight");
  await expect(receive).toHaveAttribute("aria-selected","true");
  await expect(panel.getByRole("button",{name:"开启接收",exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([]);
});

test("原生互传适配器按后端命令传递ID与地址",async({page})=>{
  await page.goto("/tests/harness.html");
  expect(await page.evaluate(()=>window.verifyTransferIPC())).toEqual([
    {command:"transfer_receive",args:{shelfId:3,bindAddress:"127.0.0.1:0"}},
    {command:"transfer_decide",args:{id:"synthetic-batch",accept:false}},
    {command:"transfer_send",args:{shelfId:1,ids:[1,2],address:"127.0.0.1:53317",fingerprint:"a".repeat(64)}},
    {command:"transfer_cancel_send",args:{}},
  ]);
});

test("文件互传默认关闭，显式开启并确认接收才提交",async({page})=>{
  await page.context().grantPermissions(["clipboard-read","clipboard-write"]);
  await page.addInitScript(()=>{
    const state=JSON.parse(localStorage.getItem("test-state")||"null")??{shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},{id:2,name:"本次中转",kind:"session",root:null,available:true}],items:[{id:1,name:"Alpha.txt",shelf_id:1,path:"SYNTHETIC/Alpha.txt",kind:"txt",bytes:200,modified:1,status:"normal",tags:[]},{id:2,name:"中文 文件.txt",shelf_id:1,path:"SYNTHETIC/中文 文件.txt",kind:"txt",bytes:200,modified:1,status:"normal",tags:[]},{id:3,name:"Gamma.txt",shelf_id:1,path:"SYNTHETIC/Gamma.txt",kind:"txt",bytes:200,modified:1,status:"normal",tags:[]}],jobs:[]};
    state.shelves.push({id:3,name:"合成接收目录",kind:"bound",root:"SYNTHETIC/receive",available:true});localStorage.setItem("test-state",JSON.stringify(state));
  });
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await expect(page.getByRole("menuitem",{name:"文件互传",exact:true})).toBeVisible({timeout:1000});
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([]);
  await panel.getByLabel("接收文件架").selectOption("3");
  await panel.getByText("手动指定网络地址（通常无需填写）",{exact:true}).click();
  await panel.getByLabel("本机监听地址").fill("127.0.0.1:0");
  await panel.getByRole("button",{name:"开启接收",exact:true}).click();
  await expect(panel.getByLabel("本机地址")).toHaveValue("127.0.0.1:53317");
  await panel.getByText("地址与证书信息",{exact:true}).click();
  await panel.getByRole("button",{name:"复制地址"}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe("127.0.0.1:53317");
  await panel.getByRole("button",{name:"复制指纹"}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe("a".repeat(64));
  await panel.getByRole("button",{name:"关闭文件互传",exact:true}).click();
  await page.evaluate(()=>window.transferHarness.pending());
  await expect(panel).toBeVisible();await expect(panel).toContainText("合成发送端");
  await expect(panel).toContainText("中文 文件.txt");
  await panel.getByRole("button",{name:"接受文件",exact:true}).click();
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual(["receive:3:127.0.0.1:0","decide:synthetic-batch:true"]);
});

test("选中项发送使用固定ID，进度与取消等待以真实终态为准",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"选择 Alpha.txt",exact:true}).click();
  await page.getByRole("button",{name:"选择 中文 文件.txt",exact:true}).click({modifiers:["Control"]});
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"发送到设备",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByText("手动连接 / 查看设备信息",{exact:true}).click();
  await panel.getByLabel("接收方地址").fill("127.0.0.1:53317");
  await panel.getByLabel("证书指纹").fill("a".repeat(64));
  await panel.getByRole("button",{name:"发送文件",exact:true}).click();
  await page.evaluate(()=>window.transferHarness.progress({job_id:17,phase:"sending",file_index:1,file_count:2,file_bytes:64,file_total:100,bytes:164,total:200}));
  await expect(panel.getByRole("status")).toContainText("164 B / 200 B");
  await panel.getByRole("button",{name:"取消发送",exact:true}).click();
  await expect(panel.getByRole("status")).toContainText("正在取消");
  await expect(panel).not.toContainText("发送完成");
  await page.evaluate(()=>window.transferHarness.finish("cancelled"));
  await expect(panel.getByRole("status")).toContainText("已取消");
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([`send:1:1,2:127.0.0.1:53317:${"a".repeat(64)}`,"cancel-send"]);
});
