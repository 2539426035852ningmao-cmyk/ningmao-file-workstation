import {test,expect} from '@playwright/test';
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
