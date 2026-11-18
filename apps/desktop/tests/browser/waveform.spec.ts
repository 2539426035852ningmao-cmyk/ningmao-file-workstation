import {test,expect,type Page} from '@playwright/test';
test('重开直接恢复波形，只重新解析发生变化的同尺寸音频',async({page})=>{
 await page.addInitScript(()=>{
   if(localStorage.getItem('test-state'))return;
   localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'合成音频',kind:'persistent',available:true}],jobs:[],items:[1,2].map(id=>({id,shelf_id:1,name:`合成${id}.wav`,kind:'wav',path:`SYNTHETIC/${id}.wav`,bytes:120,modified:1,thumbnail_stamp:'1001',status:'normal',tags:[]}))}));
   localStorage.setItem('test-waveforms',JSON.stringify({1:{duration:2,peaks:[0,.4]},2:{duration:3,peaks:[.2,1]}}));
 });
 const calls=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('test-waveform-calls')||'[]') as number[]);
 const ready=()=>expect(page.locator('.audio-wave-track svg')).toHaveCount(2);
 await page.goto('/tests/harness.html?trace-waveforms');await ready();
 const initial=await calls();expect([...initial].sort()).toEqual([1,2]);
 await page.reload();await ready();expect(await calls()).toEqual(initial);
 await page.evaluate(()=>{
   const state=JSON.parse(localStorage.getItem('test-state')!);
   state.items[1].thumbnail_stamp='1002';localStorage.setItem('test-state',JSON.stringify(state));
 });
 await page.reload();await ready();expect(await calls()).toEqual([...initial,2]);
});
test('显式音频预览排在可见普通卡片之前，文件仍保持原顺序',async({page})=>{
 await page.addInitScript(()=>{
   localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'合成架',kind:'persistent',available:true}],jobs:[],items:[1,2,3,4].map(id=>({id,shelf_id:1,name:`合成${id}.wav`,kind:'wav',path:`SYNTHETIC/${id}.wav`,bytes:120,modified:1,status:'normal',tags:id===3?['精选']:[]}))}));
   localStorage.setItem('test-previews',JSON.stringify({4:{kind:'audio',url:'data:audio/wav;base64,AAAA'}}));
   localStorage.setItem('test-waveforms',JSON.stringify(Object.fromEntries([1,2,3,4].map(id=>[id,{duration:2,peaks:[0,.4]}]))));
 });
 await page.setViewportSize({width:640,height:520});
 await page.goto('/tests/harness.html?trace-waveforms');
 const calls=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('test-waveform-calls')||'[]') as number[]);
 await expect.poll(async()=>(await calls())[0]).toBe(3);
 await page.getByRole('button',{name:'选择 合成4.wav'}).click();await page.keyboard.press('Space');
 await expect(page.getByRole('dialog',{name:'快速预览'}).locator('.audio-wave-track svg')).toBeVisible();
 expect(await calls()).toEqual([3,4]);
 await page.keyboard.press('Escape');
 await expect.poll(()=>page.locator('[data-item-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-item-id')))).toEqual(['1','2','3','4']);
});
test('大素材架只解析可见音频，滚走后跳过过期请求',async({page})=>{
 await page.addInitScript(()=>{
   const count=1000;
   localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'合成素材架',kind:'persistent',available:true}],jobs:[],items:Array.from({length:count},(_,index)=>({id:index+1,shelf_id:1,name:`合成${index+1}.wav`,kind:'wav',path:`SYNTHETIC/${index+1}.wav`,bytes:120,modified:1,status:'normal',tags:[]}))}));
   localStorage.setItem('test-waveforms',JSON.stringify(Object.fromEntries(Array.from({length:count},(_,index)=>[index+1,{duration:2,peaks:[0,.4]}]))));
 });
 await page.setViewportSize({width:480,height:520});
 await page.goto('/tests/harness.html?trace-waveforms');
 const calls=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('test-waveform-calls')||'[]') as number[]);
 await expect.poll(async()=>(await calls()).length).toBeGreaterThan(0);
 await page.getByTestId('file-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight;});
 await expect.poll(async()=>(await calls()).some(id=>id>975)).toBe(true);
 await expect(page.locator('.audio-wave-track svg').last()).toBeVisible();
 const requests=await calls();
 expect(requests.length).toBeLessThan(36);
 expect(requests.every(id=>id<40||id>975)).toBe(true);
});
async function audioFixture(page:Page){await page.goto('/tests/harness.html');await page.evaluate(()=>{
 const count=160000,bytes=new Uint8Array(44+count*2),v=new DataView(bytes.buffer),word=(o:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[o+i]=s.charCodeAt(i)};
 word(0,'RIFF');v.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,count*2,true);
 for(let i=count/2;i<count;i++)v.setInt16(44+i*2,Math.sin(i*.1)*8000,true);
 let raw='';for(const b of bytes)raw+=String.fromCharCode(b);const url='data:audio/wav;base64,'+btoa(raw);
 const state={shelves:[{id:1,name:"合成试听架",kind:"persistent",root:null,available:true}],items:[1,2].map(id=>({id,shelf_id:1,path:`SYNTHETIC/audio${id}.wav`,modified:1,status:"normal",tags:[]})),jobs:[]};state.items=state.items.slice(0,2).map((i:{id:number})=>({...i,name:`试听${i.id}.wav`,kind:'wav',bytes:bytes.length}));localStorage.setItem('test-state',JSON.stringify(state));
 localStorage.setItem('test-previews',JSON.stringify({1:{kind:'audio',url,ticket:'audio-1'},2:{kind:'audio',url,ticket:'audio-2'}}));
 localStorage.setItem('test-waveforms',JSON.stringify({1:{duration:20,peaks:[0,0,.2,.6,.4,.3]},2:{duration:20,peaks:[.1,.4,.2,.6]}}));
 });await page.reload();}
test('卡片真实波形可定位试听，跨窗口独占，暂停恢复，预览也接续独占',async({page,context})=>{
 await audioFixture(page);const track=page.getByRole('slider',{name:'试听进度 试听1.wav',exact:true});await expect(track.locator('svg path').first()).toHaveAttribute('d',/M/);
 const first=page.getByLabel('音频试听 试听1.wav',{exact:true});expect(await first.evaluate((p:HTMLAudioElement)=>p.paused)).toBe(true);
 await track.click({position:{x:await track.evaluate(e=>e.clientWidth*.6),y:20}});await expect.poll(()=>first.evaluate((p:HTMLAudioElement)=>p.currentTime)).toBeGreaterThan(11);await expect.poll(()=>first.evaluate((p:HTMLAudioElement)=>p.paused)).toBe(false);
 const other=await context.newPage();await other.goto('/tests/harness.html');await other.getByRole('button',{name:'播放 试听2.wav',exact:true}).click();await expect.poll(()=>first.evaluate((p:HTMLAudioElement)=>p.paused)).toBe(true);
 const second=other.getByLabel('音频试听 试听2.wav',{exact:true});await expect.poll(()=>second.evaluate((p:HTMLAudioElement)=>p.paused)).toBe(false);
 await other.getByRole('button',{name:'暂停 试听2.wav',exact:true}).click();await expect.poll(()=>second.evaluate((p:HTMLAudioElement)=>p.paused)).toBe(true);await other.getByRole('button',{name:'播放 试听2.wav',exact:true}).click();
 await page.bringToFront();await page.getByRole('button',{name:'选择 试听1.wav',exact:true}).click();await page.keyboard.press('Space');const preview=page.getByRole('dialog',{name:'快速预览',exact:true});await preview.getByRole('button',{name:'播放 试听1.wav',exact:true}).click();await expect.poll(()=>second.evaluate((p:HTMLAudioElement)=>p.paused)).toBe(true);await page.keyboard.press('Escape');await expect(preview).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('test-preview-released'))).toBe('audio-1');
});
test('延迟完成的旧播放请求不能暂停后续的重新播放',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLMediaElement.prototype.play;Object.assign(window,{testAudioSettled:0});HTMLMediaElement.prototype.play=function(){return original.call(this).then(()=>new Promise<void>(resolve=>setTimeout(resolve,500)),error=>new Promise<void>((_,reject)=>setTimeout(()=>reject(error),500))).finally(()=>{const w=window as unknown as {testAudioSettled:number};w.testAudioSettled++;});};});
 await audioFixture(page);const audio=page.getByLabel('音频试听 试听1.wav',{exact:true});
 await page.getByRole('button',{name:'播放 试听1.wav',exact:true}).click();await page.getByRole('button',{name:'暂停 试听1.wav',exact:true}).click();await page.getByRole('button',{name:'播放 试听1.wav',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {testAudioSettled:number}).testAudioSettled)).toBe(2);
 expect(await audio.evaluate((p:HTMLAudioElement)=>p.paused)).toBe(false);await expect(page.getByRole('button',{name:'暂停 试听1.wav',exact:true})).toBeVisible();
});
