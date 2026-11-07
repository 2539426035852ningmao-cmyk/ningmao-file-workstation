import {test,expect} from '@playwright/test';
test('浏览器分享仅在组件可用时出现，按素材ID创建且可停止',async({page})=>{
  await page.goto('/tests/harness.html?browser-share');
  await page.getByText('Alpha.txt',{exact:true}).click();
  await page.getByRole('button',{name:'更多操作',exact:true}).click();
  await page.getByRole('menuitem',{name:'发送到设备',exact:true}).click();
  await page.getByRole('tab',{name:'发送文件',exact:true}).click();
  await page.getByText('浏览器分享测试（仅本机）',{exact:true}).click();
  await page.getByRole('button',{name:'创建浏览器分享',exact:true}).click();
  await expect(page.getByLabel('浏览器分享代码')).toHaveValue(/^[a-f0-9-]{36}$/);
  expect(await page.evaluate(()=>window.transferHarness.calls())).toContain('browser:1:1:36');
  await page.getByRole('button',{name:'停止浏览器分享',exact:true}).click();
  await expect(page.getByText('已停止，来源保留',{exact:true})).toBeVisible();
});
test('未配置分享组件时不显示空入口',async({page})=>{
  await page.goto('/tests/harness.html');
  await page.getByRole('button',{name:'更多操作',exact:true}).click();
  await page.getByRole('menuitem',{name:'文件互传',exact:true}).click();
  await page.getByRole('tab',{name:'发送文件',exact:true}).click();
  await expect(page.getByRole('button',{name:'创建浏览器分享',exact:true})).toHaveCount(0);
});
