import {expect,test} from "@playwright/test";

test("W0 合成文件：新增→防重→本机预览→关闭→移除→清空",async({page})=>{
  await page.goto("/");
  const add=page.getByRole("button",{name:"添加本地测试文件，体验准备流程"});
  const send=page.getByRole("button",{name:/发送文件/});
  await expect(send).toBeDisabled();
  await add.click();
  await expect(page.getByText("Ningmao-本地测试.txt",{exact:true})).toBeVisible();
  await add.click();
  await expect(page.locator(".queue-feedback")).toContainText("重复");
  await expect(page.getByText("显示 1 / 1 项")).toBeVisible();
  await page.getByRole("button",{name:"预览 Ningmao-本地测试.txt"}).click();
  const preview=page.getByRole("dialog",{name:"Ningmao-本地测试.txt"});
  await expect(preview).toContainText("本地合成样例");
  await expect(preview).toContainText("没有上传至服务器");
  await page.keyboard.press("Escape");
  await expect(preview).not.toBeVisible();
  await page.getByRole("button",{name:"移除 Ningmao-本地测试.txt"}).click();
  await expect(page.getByText("Ningmao-本地测试.txt",{exact:true})).toHaveCount(0);
  await add.click();
  await page.getByRole("button",{name:"清空列表"}).click();
  await expect(page.getByText("Ningmao-本地测试.txt",{exact:true})).toHaveCount(0);
  await expect(send).toBeDisabled();
});

test("W0 本地队列：搜索、筛选、排序与安全文件名",async({page})=>{
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles([
    {name:"分镜.png",mimeType:"image/png",buffer:Buffer.from("not-an-image")},
    {name:"剧情.txt",mimeType:"text/plain",buffer:Buffer.from("synthetic")},
    {name:"大镜头.mp4",mimeType:"video/mp4",buffer:Buffer.alloc(120)}
  ]);
  await expect(page.getByText("显示 3 / 3 项")).toBeVisible();
  await page.getByRole("combobox",{name:"按文件类型筛选"}).selectOption("video");
  await expect(page.getByText("显示 1 / 3 项")).toBeVisible();
  await expect(page.getByRole("button",{name:"预览 大镜头.mp4"})).toBeVisible();
  await page.getByRole("combobox",{name:"按文件类型筛选"}).selectOption("all");
  await page.getByRole("searchbox",{name:"搜索待发送文件"}).fill("剧情");
  await expect(page.getByText("显示 1 / 3 项")).toBeVisible();
  await expect(page.getByRole("button",{name:"预览 剧情.txt"})).toBeVisible();
  await page.getByRole("searchbox",{name:"搜索待发送文件"}).fill("");
  await page.getByRole("combobox",{name:"排序待发送文件"}).selectOption("size");
  const names=await page.locator(".queue li .file-details strong").allTextContents();
  expect(names).toEqual(["大镜头.mp4","分镜.png","剧情.txt"]);
  await page.locator('input[type="file"]').setInputFiles([
    {name:"CON.txt",mimeType:"text/plain",buffer:Buffer.from("unsafe")}
  ]);
  await expect(page.locator(".queue-feedback")).toContainText("不安全文件名");
  await expect(page.getByText("显示 3 / 3 项")).toBeVisible();
});

test("W0 文件限制明确提示，不显示伪造完成或在线设备",async({page})=>{
  await page.goto("/");
  const large={name:"synthetic-large.bin",mimeType:"application/octet-stream",buffer:Buffer.alloc(1)};
  await page.locator('input[type="file"]').setInputFiles(large);
  await expect(page.getByRole("button",{name:/发送文件/})).toBeDisabled();
  await expect(page.getByText("尚未连接设备")).toBeVisible();
  await page.getByRole("button",{name:"我的设备"}).click();
  await expect(page.getByText("设备连接尚未启用")).toBeVisible();
  await page.getByRole("button",{name:"传输记录"}).click();
  await expect(page.getByText("还没有传输任务")).toBeVisible();
  await page.getByRole("button",{name:"文件互传",exact:true}).click();
  await expect(page.getByText("synthetic-large.bin")).toBeVisible();
  expect(large.buffer.byteLength).toBe(1);
});

test("三套完整主题在刷新后保持，并支持窄屏移动导航",async({page})=>{
  await page.goto("/");
  for(const [name,value] of [["浅白","light"],["亮蓝","blue"],["深蓝","dark"]] as const){
    await page.getByRole("button",{name}).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme",value);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme",value);
  }
  await page.setViewportSize({width:360,height:740});
  await page.getByRole("button",{name:"打开导航"}).click();
  await page.getByRole("button",{name:"我的设备"}).last().click();
  await expect(page.getByRole("heading",{name:"我的设备"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
