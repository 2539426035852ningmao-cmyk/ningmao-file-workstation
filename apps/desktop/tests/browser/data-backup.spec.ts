import {test,expect} from '@playwright/test';
test('设置内备份与待重启恢复反馈，不改变当前素材',async({page})=>{
 await page.goto('/tests/harness.html?manager');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const before=await page.evaluate(()=>localStorage.getItem('test-state'));
 await page.getByRole('button',{name:'导出数据备份',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('数据备份已导出并通过完整性检查');
 await page.getByRole('button',{name:'从备份恢复',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('请完整退出并重新启动');
 expect(await page.evaluate(()=>localStorage.getItem('test-state'))).toBe(before);
 expect(await page.evaluate(()=>window.testHarness.calls())).toContain('backup-restore-scheduled');
});
test('取消导出不会报告备份成功',async({page})=>{
 await page.goto('/tests/harness.html?manager&cancel-backup');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'导出数据备份',exact:true}).click();
 await expect(page.getByRole('status')).not.toContainText('数据备份已导出');
});
