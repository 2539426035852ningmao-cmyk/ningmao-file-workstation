import {test,expect} from '@playwright/test';
async function create(page:import('@playwright/test').Page){await page.getByRole('button',{name:'切换文件架',exact:true}).click();await page.getByRole('menuitem',{name:'新建文件架',exact:true}).click();return page.getByRole('dialog',{name:'新建文件架',exact:true});}
test('重要表单居中，背景和Esc不关闭，关闭重开与刷新页面都恢复草稿',async({page})=>{
 await page.setViewportSize({width:640,height:720});await page.goto('/tests/harness.html');
 let dialog=await create(page);await dialog.getByRole('textbox',{name:'文件架名称',exact:true}).fill('待完成的中文草稿');
 const box=await dialog.boundingBox();expect(Math.abs(box!.x+box!.width/2-320)).toBeLessThan(2);
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await page.mouse.click(4,4);await expect(dialog).toBeVisible();
 await page.getByRole('button',{name:'关闭新建文件架',exact:true}).click();dialog=await create(page);await expect(dialog.getByRole('textbox')).toHaveValue('待完成的中文草稿');
 await page.reload();dialog=await create(page);await expect(dialog.getByRole('textbox')).toHaveValue('待完成的中文草稿');
 await dialog.getByRole('button',{name:'创建',exact:true}).click();await expect(dialog).toHaveCount(0);dialog=await create(page);await expect(dialog.getByRole('textbox')).toHaveValue('');
});
test('预览没有外部打开按钮，文件名和精简信息直接可见',async({page})=>{
 await page.goto('/tests/harness.html');await page.getByRole('button',{name:'选择 Alpha.txt',exact:true}).click();await page.keyboard.press('Space');
 const dialog=page.getByRole('dialog',{name:'快速预览',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'用默认程序打开'})).toHaveCount(0);await expect(dialog.getByText('Alpha.txt',{exact:true})).toHaveCount(1);
});
test('损坏草稿安全回退，刷新入口保留检索和选择',async({page})=>{
 await page.goto('/tests/harness.html');await page.evaluate(()=>localStorage.setItem('ningmao-draft-v1:main:1:shelf-form:new','null'));const dialog=await create(page);await expect(dialog.getByRole('textbox')).toHaveValue('');await page.getByRole('button',{name:'关闭新建文件架',exact:true}).click();
 await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('Alpha');const item=page.getByRole('button',{name:'选择 Alpha.txt',exact:true});await item.click();await page.getByRole('button',{name:'刷新当前文件架',exact:true}).click();await expect(item).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('textbox',{name:'搜索文件',exact:true})).toHaveValue('Alpha');
});
test('图片信息显示原图尺寸，不能把缩放预览尺寸当成文件尺寸',async({page})=>{
 await page.goto('/tests/harness.html');await page.evaluate(()=>localStorage.setItem('test-previews',JSON.stringify({1:{kind:'image',dimensions:[480,960],url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="100%" height="100%" fill="gray"/></svg>')}})));
 await page.getByRole('button',{name:'选择 Alpha.txt',exact:true}).click();await page.keyboard.press('Space');await expect(page.getByRole('dialog').getByText('480 × 960 px',{exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByText('800 × 1600 px',{exact:true})).toHaveCount(0);
});
