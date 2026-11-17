import {test,expect} from '@playwright/test';

test('选中项不再挤出详情和拖出按钮 空格内容预览居中且保留输入语义',async({page})=>{
 await page.setViewportSize({width:420,height:520});await page.goto('/tests/harness.html');
 await page.evaluate(()=>localStorage.setItem('test-previews',JSON.stringify({1:{kind:'text',text:'合成正文 <script>不能执行</script>'}})));
 await page.getByRole('button',{name:'选择 Alpha.txt',exact:true}).click();
 await expect(page.getByRole('button',{name:'详情',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'拖出复制',exact:true})).toHaveCount(0);
 await page.keyboard.press('Space');
 const preview=page.getByRole('dialog',{name:'快速预览',exact:true});await expect(preview).toBeVisible();
 await expect(preview.locator('.preview-content')).toBeVisible();
 await expect(preview.getByLabel('文件内容',{exact:true})).toContainText('合成正文 <script>不能执行</script>');
 const box=await preview.boundingBox();expect(Math.abs(box!.x+box!.width/2-210)).toBeLessThan(2);expect(Math.abs(box!.y+box!.height/2-260)).toBeLessThan(2);
 await page.keyboard.press('Escape');await expect(preview).toBeHidden();
 const input=page.getByRole('textbox',{name:'搜索文件',exact:true});await input.fill('Alpha');await input.press('Space');await expect(input).toHaveValue('Alpha ');await expect(preview).toBeHidden();
});

test('音频不自动播放 空格播放暂停 Esc停止并释放 文字输入不抢键',async({page})=>{
 await page.addInitScript(()=>document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('audio')){event.preventDefault();event.stopImmediatePropagation();}},true));
 await page.setViewportSize({width:420,height:520});await page.goto('/tests/harness.html');
 await page.evaluate(()=>{
   const samples=80000,bytes=new Uint8Array(44+samples*2),view=new DataView(bytes.buffer);const word=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
   word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,samples*2,true);
   let raw='';for(const b of bytes)raw+=String.fromCharCode(b);localStorage.setItem('test-previews',JSON.stringify({1:{kind:'audio',url:'data:audio/wav;base64,'+btoa(raw),ticket:'synthetic-audio'}}));
 });
 await page.getByRole('button',{name:'选择 Alpha.txt',exact:true}).click();await page.keyboard.press('Space');
 const audio=page.getByLabel('音频试听 Alpha.txt',{exact:true});await expect(page.getByRole('slider',{name:'试听进度 Alpha.txt',exact:true})).toBeVisible();await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.readyState)).toBeGreaterThan(0);
 expect(await audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 await page.keyboard.press('Space');await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);
 await page.getByRole('slider',{name:'试听进度 Alpha.txt',exact:true}).focus();await page.keyboard.press('Space');await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 await page.keyboard.press('Space');await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);
 await page.keyboard.press('Space');await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 await page.keyboard.press('Space');await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);
 // Model a media-control document listener consuming Escape ahead of Radix.
 await page.getByRole('button',{name:'暂停 Alpha.txt',exact:true}).click();await page.getByRole('button',{name:'播放 Alpha.txt',exact:true}).click();await page.getByRole('button',{name:'暂停 Alpha.txt',exact:true}).focus();
 const handle=await audio.elementHandle();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();expect(await handle!.evaluate((a:HTMLAudioElement)=>a.paused&&a.getAttribute('src')===null)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('test-preview-released'))).toBe('synthetic-audio');
});

for(const theme of ['light','dark','blue'])test(`紧凑菜单与圆角虚化 ${theme}`,async({page})=>{
 await page.setViewportSize({width:640,height:720});await page.addInitScript(theme=>localStorage.setItem('ningmao-theme',theme),theme);await page.goto('/tests/harness.html');
 await page.getByRole('button',{name:'更多操作',exact:true}).click();const menu=page.getByRole('menu',{name:'更多操作',exact:true});
 const first=await menu.boundingBox();expect(first!.width).toBeLessThanOrEqual(400);expect(first!.height).toBeLessThanOrEqual(380);
 const overlay=page.locator('.shelf-menu-backdrop');expect(await overlay.evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('blur(1.95px)');expect(await overlay.evaluate(e=>getComputedStyle(e).clipPath)).toContain('round 20px');
 await page.getByRole('menuitem',{name:'设置',exact:true}).click();const second=await menu.boundingBox();expect(second!.width).toBe(first!.width);expect(second!.height).toBe(first!.height);
 await expect(page.getByRole('menuitem',{name:'账户 预留',exact:true})).toBeDisabled();
});
