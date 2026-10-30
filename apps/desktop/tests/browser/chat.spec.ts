import {expect,test} from "@playwright/test";

test("原生聊天适配器使用后端命令及参数名称",async({page})=>{
  await page.goto("/tests/harness.html");
  expect(await page.evaluate(()=>window.verifyChatIPC())).toEqual([
    {command:"chat_configure",args:{baseUrl:"http://localhost:11434/v1",model:"synthetic",enabled:true,apiKey:null}},
    {command:"chat_send",args:{sessionId:42,text:"合成消息"}},
    {command:"chat_stop",args:{sessionId:42}},
  ]);
});

test("AI入口可脱机配置，聊天上下文和历史由后端保存",async({page})=>{
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"AI 对话",exact:true}).click();
  const chat=page.getByRole("dialog",{name:"AI 对话",exact:true});
  await expect(chat).toContainText("配置模型后开始对话");
  await chat.getByRole("button",{name:"模型设置",exact:true}).click();
  await chat.getByLabel("服务地址").fill("http://localhost:11434/v1");
  await chat.getByLabel("模型 ID").fill("synthetic-model");
  await chat.getByLabel("启用模型服务").check();
  await chat.getByRole("button",{name:"保存设置",exact:true}).click();
  await chat.getByLabel("消息").fill("记住合成编号42");
  await chat.getByRole("button",{name:"发送",exact:true}).click();
  await expect(chat.getByRole("log")).toContainText("受控接口：记住合成编号42");
  await chat.getByLabel("消息").fill("编号是什么");
  await chat.getByRole("button",{name:"发送",exact:true}).click();
  await expect(chat.getByRole("log")).toContainText("受控接口：编号是什么");
  await chat.getByRole("button",{name:"关闭 AI 对话",exact:true}).click();
  await page.reload();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"AI 对话",exact:true}).click();
  await expect(page.getByRole("log")).toContainText("记住合成编号42");
  await page.getByRole("button",{name:"模型设置",exact:true}).click();
  await page.getByRole("button",{name:"测试已保存配置",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"AI 对话",exact:true}).getByRole("status")).toContainText("模型已返回有效回复");
});

for(const theme of ["light","dark"])test(`AI抽屉 340×320 ${theme} 设置和发送可达`,async({page},info)=>{
  await page.setViewportSize({width:340,height:320});
  await page.goto("/tests/harness.html");
  await page.evaluate(theme=>{document.documentElement.classList.toggle("dark",theme==="dark");},theme);
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"AI 对话",exact:true}).click();
  const chat=page.getByRole("dialog",{name:"AI 对话",exact:true});
  await expect(chat.getByRole("button",{name:"发送",exact:true})).toBeVisible();
  expect(await chat.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await chat.getByRole("button",{name:"模型设置",exact:true}).click();
  await chat.getByRole("button",{name:"保存设置",exact:true}).scrollIntoViewIfNeeded();
  await expect(chat.getByRole("button",{name:"保存设置",exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath(`chat-${theme}.png`)});
});
