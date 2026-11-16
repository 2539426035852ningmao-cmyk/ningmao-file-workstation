import {expect,type Page} from "@playwright/test";
export async function selectScene(page:Page,name:string){await page.getByRole("menuitem",{name,exact:true}).click();await expect(page.getByRole("region",{name,exact:true})).toBeVisible();}
export async function expandDisplayOptions(page:Page){await selectScene(page,"显示与整理");}
export async function sceneItem(page:Page,name:string){
 const scene=/^(文件互传|AI 对话|任务记录|柠猫回收站|管理中心)$/.test(name)?"工具与记录":/^(收起到悬浮入口|拆分为独立窗口|合并回主窗口|关闭悬浮入口|完整退出)$/.test(name)?"窗口与入口":/^(刷新文件状态|筛选文件)$/.test(name)?"显示与整理":"常用操作";
 await selectScene(page,scene);return page.getByRole("menuitem",{name,exact:true});
}
export async function displayOption(page:Page,name:string){await selectScene(page,name.endsWith("主题")?"设置":"显示与整理");return page.getByRole("menuitemradio",{name,exact:true});}
