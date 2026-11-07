import {test,expect} from '@playwright/test';
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
