import {test,expect} from '@playwright/test';
test('浏览器分享提供直达接收链接，停止后移除失效链接',async({page})=>{
 await page.goto('/tests/harness.html?browser-share');
 await page.getByText('Alpha.txt',{exact:true}).click();
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'发送到设备',exact:true}).click();
 await page.getByText('浏览器分享测试（仅本机）',{exact:true}).click();
 await page.getByRole('button',{name:'创建浏览器分享',exact:true}).click();
 const link=page.getByLabel('浏览器接收链接',{exact:true});
 await expect(link).toBeVisible();
 const url=new URL(await link.inputValue());
 expect(url.origin).toBe('http://127.0.0.1:53323');
 expect(new URLSearchParams(url.hash.split('?')[1]).get('code')).toMatch(/^[a-f0-9-]{36}$/);
 await expect(page.getByRole('button',{name:'复制接收链接',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'停止浏览器分享',exact:true}).click();
 await expect(link).toHaveCount(0);
});
for(const theme of ['light','dark','blue'])test(`接收就绪只展示关键动作，技术信息可用键盘展开 ${theme}`,async({page})=>{
 await page.setViewportSize({width:340,height:320});await page.addInitScript(value=>localStorage.setItem('ningmao-theme',value),theme);
 await page.goto('/tests/harness.html');await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'文件互传',exact:true}).click();
 await page.getByRole('button',{name:'选择保存文件夹',exact:true}).click();
 await page.getByRole('button',{name:'开启接收',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'文件互传',exact:true});
 await expect(panel.getByText('已准备好接收 · 设备码 AAAAAA')).toBeInViewport({ratio:1});
 await expect(panel.getByLabel('本机地址',{exact:true})).toBeHidden();
 await expect(panel.getByRole('button',{name:'复制连接信息',exact:true})).toBeInViewport({ratio:1});
 await expect(panel.getByRole('button',{name:'停止接收',exact:true})).toBeInViewport({ratio:1});
 await page.screenshot({path:`${process.env.M105_TEST_OUTPUT||'test-results'}/receive-ready-${theme}.png`});
 const details=panel.getByText('地址与证书信息',{exact:true});await details.focus();await details.press('Enter');
 await expect(panel.getByLabel('本机地址',{exact:true})).toHaveValue('127.0.0.1:53317');
 await expect(panel.getByLabel('本机证书指纹',{exact:true})).toHaveValue('a'.repeat(64));
 await panel.getByRole('button',{name:'停止接收',exact:true}).click();
 await expect(panel.getByRole('button',{name:'开启接收',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual(['receive:3:','stop-receive']);
});
test('零选择可以直接返回选文件，测试分享默认收起',async({page})=>{
 await page.goto('/tests/harness.html?browser-share');
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'文件互传',exact:true}).click();
 await page.getByRole('tab',{name:'发送文件',exact:true}).click();
 await expect(page.getByText('1. 选择文件',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'创建浏览器分享',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'返回文件架选文件',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'文件互传',exact:true})).toBeHidden();
});

test('连接信息一次粘贴填好地址指纹，不自动发送',async({page})=>{
 await page.goto('/tests/harness.html');
 await page.getByText('Alpha.txt',{exact:true}).click();
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'发送到设备',exact:true}).click();
 await page.getByLabel('粘贴对方的连接信息').fill('ningmao://receive?address=127.0.0.1%3A53317&fingerprint='+ 'a'.repeat(64));
 await expect(page.getByLabel('接收方地址',{exact:true})).toHaveValue('127.0.0.1:53317');
 await expect(page.getByLabel('证书指纹',{exact:true})).toHaveValue('a'.repeat(64));
 expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([]);
 await expect(page.getByRole('button',{name:'发送文件',exact:true})).toBeEnabled();
});

test('附近设备单击选中后可发送，无需填写地址',async({page})=>{
 await page.goto('/tests/harness.html?nearby');
 await page.getByText('Alpha.txt',{exact:true}).click();
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'发送到设备',exact:true}).click();
 await page.getByRole('button',{name:'合成接收电脑 · AAAAAA',exact:true}).click();
 await expect(page.getByRole('button',{name:'确认设备并发送',exact:true})).toBeEnabled();
 await expect(page.getByLabel('接收方地址',{exact:true})).toHaveValue('127.0.0.1:53317');
 expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([]);
});

test('首次接收可以就地选择文件夹，选择后不会自动监听',async({page})=>{
 await page.goto('/tests/harness.html');
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'文件互传',exact:true}).click();
 await page.getByRole('button',{name:'选择保存文件夹',exact:true}).click();
 await expect(page.getByLabel('接收文件架')).toHaveValue('3');
 await expect(page.getByRole('button',{name:'开启接收',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([]);
});


test('首次确认设备先配对再发送，重新打开后记住设备',async({page})=>{
 await page.goto('/tests/harness.html?nearby');
 await page.getByText('Alpha.txt',{exact:true}).click();
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'发送到设备',exact:true}).click();
 await page.getByRole('button',{name:'合成接收电脑 · AAAAAA',exact:true}).click();
 await page.getByRole('button',{name:'确认设备并发送',exact:true}).click();
 expect((await page.evaluate(()=>window.transferHarness.calls()))[0]).toBe('pair:127.0.0.1:53317');
 await page.reload();
 await page.getByText('Alpha.txt',{exact:true}).click();
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'发送到设备',exact:true}).click();
 await page.getByRole('button',{name:'合成接收电脑 · AAAAAA · 已配对',exact:true}).click();
 await expect(page.getByRole('button',{name:'发送文件',exact:true})).toBeEnabled();
});
