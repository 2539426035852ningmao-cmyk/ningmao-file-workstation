import {expect,test} from '@playwright/test';

test('任务中心如实显示接收与浏览器分享，不再把所有任务称为复制',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'互传素材',kind:'persistent',root:null,available:true}],items:[],jobs:[{id:1,shelf_id:1,status:'copying',message:'接收文件：接收中 · 0/1 项 · 32/64 B',staging:null},{id:2,shelf_id:1,status:'completed',message:'浏览器分享完成；来源保留',staging:null}]})));
  await page.goto('/tests/harness.html?manager');
  await page.getByRole('button',{name:'任务中心',exact:true}).click();
  const receiving=page.getByRole('article',{name:'任务 1',exact:true});
  await expect(receiving).toContainText('进行中');
  await expect(receiving).toContainText('接收文件：接收中');
  await expect(page.getByRole('article',{name:'任务 2',exact:true})).toContainText('浏览器分享完成');
  await expect(page.getByText('复制中',{exact:true})).toHaveCount(0);
  await receiving.getByRole('button',{name:'取消任务',exact:true}).click();
  expect(await page.evaluate(()=>window.testHarness.calls().filter(c=>c==='cancel:1').length)).toBe(1);
  await expect(receiving).toContainText('已取消');
});
