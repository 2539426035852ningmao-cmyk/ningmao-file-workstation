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
