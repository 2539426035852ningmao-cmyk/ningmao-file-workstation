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

test('用缓存小图占位，清晰图就绪后原位替换',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
   localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'合成架',kind:'persistent',available:true}],jobs:[],
     items:[{id:1,shelf_id:1,name:'合成图.png',kind:'png',path:'SYNTHETIC/preview.png',bytes:900,modified:1,thumbnail_stamp:'1.1',status:'normal',tags:[]}]}));
   localStorage.setItem('test-previews',JSON.stringify({1:{kind:'image',dimensions:[240,360],url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="blue"/></svg>')}}));
 });
 await page.goto('/tests/harness.html?preview-delay=900');
 await expect.poll(()=>page.locator('.asset-thumbnail').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(1);
 await page.getByRole('button',{name:'选择 合成图.png'}).click();await page.keyboard.press('Space');
 const preview=page.getByRole('dialog',{name:'快速预览'});
 const image=preview.getByRole('img',{name:'合成图.png'});
 await expect(image).toHaveAttribute('data-preview-quality','small');
 const area=await image.boundingBox();
 await expect(image).toHaveAttribute('data-preview-quality','full');
 expect(await image.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBe(240);
 const sharp=await image.boundingBox();
 expect(sharp?.width).toBeCloseTo(area?.width??0,0);
 expect(sharp?.height).toBeCloseTo(area?.height??0,0);
});
