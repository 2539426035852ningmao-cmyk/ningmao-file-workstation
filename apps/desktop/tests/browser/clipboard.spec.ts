import {test,expect} from '@playwright/test';
test('菜单粘贴在临时架引用，在绑定架走既有复制任务',async({page})=>{
 for(const bound of [false,true]){
  await page.goto('/tests/harness.html');
  if(bound){await page.getByRole('button',{name:'切换文件架',exact:true}).click();await page.getByRole('menuitem',{name:'绑定文件夹',exact:true}).click();}
  await page.getByRole('button',{name:'更多操作',exact:true}).click();
  const paste=page.getByRole('menuitem',{name:'粘贴文件',exact:true});await expect(paste).toBeVisible({timeout:1500});await paste.click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain(`import:${bound?3:1}:1`);
  if(bound){await expect(page.getByRole('progressbar',{name:'当前文件复制进度'})).toBeVisible();}
  else await expect(page.getByText('剪贴板文件.txt',{exact:true})).toBeVisible();
 }
});

test('空剪贴板给出操作提示，不提交空导入',async({page})=>{
 await page.setViewportSize({width:340,height:320});await page.goto('/tests/harness.html?clipboard-empty');
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 const paste=page.getByRole('menuitem',{name:'粘贴文件',exact:true});await expect(paste).toBeVisible({timeout:1500});await paste.click();
 await expect(page.getByRole('status').filter({hasText:'剪贴板中没有可添加的文件'})).toBeVisible();
 expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(['clipboard-files']);
 await expect(page.locator('[data-item-id]')).toHaveCount(3);
 await page.screenshot({path:`${process.env.M105_TEST_OUTPUT||'test-results'}/clipboard-empty-menu.png`,animations:'disabled'});
});
test('文件架粘贴复用导入，输入框内粘贴保留原行为',async({page})=>{
 await page.goto('/tests/harness.html');
 await page.locator('body').dispatchEvent('paste');
 await expect(page.getByText('剪贴板文件.txt',{exact:true})).toBeVisible({timeout:4000});
 const before=await page.evaluate(()=>window.testHarness.calls());
 await page.getByRole('button',{name:'搜索文件',exact:true}).click();
 await page.getByPlaceholder('搜索当前文件架').dispatchEvent('paste');
 expect(await page.evaluate(()=>window.testHarness.calls())).toEqual(before);
});

test('图片粘贴保存为受管素材后复用导入',async({page})=>{
 await page.goto('/tests/harness.html');
 await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File(['synthetic'], 'clipboard.png',{type:'image/png'}));window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data}));});
 await expect(page.getByText('粘贴图片.png',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.testHarness.calls())).toContain('clipboard-image');
});
