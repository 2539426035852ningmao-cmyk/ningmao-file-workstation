import {expect,type Page} from '@playwright/test';

export async function expandDisplayOptions(page:Page){
 const options=page.getByRole('menuitem',{name:'显示与排序',exact:true});
 await options.click();await expect(options).toHaveAttribute('aria-expanded','true');
}
