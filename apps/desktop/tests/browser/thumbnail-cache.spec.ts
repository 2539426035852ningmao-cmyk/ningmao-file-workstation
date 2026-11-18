import {test,expect} from '@playwright/test';

test('小缩略图在重开后复用；源文件变化后重新读取',async({page})=>{
 const name='合成缓存.png';
 await page.addInitScript(name=>{
   if(!localStorage.getItem('test-state'))localStorage.setItem('test-state',JSON.stringify({
     shelves:[{id:1,name:'合成架',kind:'persistent',available:true}],jobs:[],
     items:[{id:1,shelf_id:1,name,kind:'png',path:'SYNTHETIC/'+name,bytes:120,modified:1,thumbnail_stamp:'1.1',status:'normal',tags:[]}],
   }));
 },name);
 await page.goto('/tests/harness.html?count-thumbnails');
 const image=page.locator('.asset-thumbnail');
 const count=()=>page.evaluate(()=>Number(sessionStorage.getItem('test-thumbnail-count')??0));
 await expect.poll(()=>image.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBe(1);
 expect(await count()).toBe(1);
 await page.reload();
 await expect.poll(()=>image.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBe(1);
 expect(await count()).toBe(1);
 await page.evaluate(()=>{
   const data=JSON.parse(localStorage.getItem('test-state')!);
   data.items[0].thumbnail_stamp='1.2';
   localStorage.setItem('test-state',JSON.stringify(data));
 });
 await page.reload();
 await expect.poll(()=>image.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBe(1);
 expect(await count()).toBe(2);
});
