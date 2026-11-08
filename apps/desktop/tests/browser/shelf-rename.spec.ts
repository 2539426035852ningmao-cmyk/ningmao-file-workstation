import {expect,test} from '@playwright/test';

test('重命名当前文件架保留选择与素材，取消不写入，重载名称恢复',async({page})=>{
  await page.addInitScript(()=>{if(!localStorage.getItem('test-state'))localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'灵感收集',kind:'persistent',root:null,available:true}],items:[{id:1,shelf_id:1,name:'Alpha.txt',path:'SYNTHETIC/Alpha.txt',kind:'txt',bytes:12,modified:1,status:'normal',tags:['收藏']}],jobs:[]}));});
  await page.goto('/tests/harness.html');
  const item=page.getByRole('button',{name:'选择 Alpha.txt',exact:true});
  await item.click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('test-state')!).items);
  await page.getByRole('button',{name:'切换文件架',exact:true}).click();
  await page.getByRole('menuitem',{name:'重命名当前文件架',exact:true}).click();
  await expect(page.getByRole('heading',{name:'重命名文件架',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'文件架名称',exact:true}).fill('不保存的名称');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'切换文件架',exact:true})).toHaveAttribute('title','灵感收集');
  await page.getByRole('button',{name:'切换文件架',exact:true}).click();
  await page.getByRole('menuitem',{name:'重命名当前文件架',exact:true}).click();
  await page.getByRole('textbox',{name:'文件架名称',exact:true}).fill('素材整理 Work');
  await page.evaluate(()=>window.testHarness.fail('名称暂未保存'));
  await page.getByRole('button',{name:'保存名称',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('名称暂未保存');
  await expect(page.getByRole('textbox',{name:'文件架名称',exact:true})).toHaveValue('素材整理 Work');
  await page.getByRole('button',{name:'保存名称',exact:true}).click();
  await expect(page.getByRole('button',{name:'切换文件架',exact:true})).toHaveAttribute('title','素材整理 Work');
  await expect(item).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-state')!).items)).toEqual(before);
  await page.reload();
  await expect(page.getByRole('button',{name:'切换文件架',exact:true})).toHaveAttribute('title','素材整理 Work');
});
