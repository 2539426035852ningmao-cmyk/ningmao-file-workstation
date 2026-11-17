import {expect,test,type Page} from '@playwright/test';
import {strToU8,zipSync} from 'fflate';

async function open(page:Page,format:string,body:Buffer){
 const name=`示例.${format}`;
 await page.route('**/fixture-document',route=>route.fulfill({body,contentType:'application/octet-stream'}));
 await page.addInitScript(({name,format})=>{
   localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'灵感收集',kind:'persistent',available:true}],items:[{id:1,name,kind:format,path:'SYNTHETIC/'+name,shelf_id:1,bytes:200,status:'normal',modified:1,tags:[]}],jobs:[]}));
   localStorage.setItem('test-previews',JSON.stringify({1:{kind:format==='pdf'?'pdf':'office',url:'/fixture-document'}}));
 },{name,format});
 await page.goto('/tests/harness.html');
 await page.getByRole('button',{name:'选择 '+name,exact:true}).click();
 await page.keyboard.press('Space');
 return page.getByRole('dialog',{name:'快速预览'});
}
function office(parts:Record<string,string>){
 return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name,value])=>[name,strToU8(value)]))));
}
test('DOCX 内容作为文字显示',async({page})=>{
 const preview=await open(page,'docx',office({'word/document.xml':'<w:document xmlns:w="urn:w"><w:p><w:r><w:t>中文正文 &lt;script&gt;</w:t></w:r></w:p></w:document>'}));
 await expect(preview.getByText('中文正文 <script>',{exact:true})).toBeVisible();
});
test('PPTX 按演示文稿顺序逐张预览',async({page})=>{
 const preview=await open(page,'pptx',office({
  'ppt/presentation.xml':'<p xmlns:r="urn:r"><sldId r:id="r2"/><sldId r:id="r1"/></p>',
  'ppt/_rels/presentation.xml.rels':'<r><Relationship Id="r1" Target="slides/slide1.xml"/><Relationship Id="r2" Target="slides/slide2.xml"/></r>',
  'ppt/slides/slide1.xml':'<s><p><t>第二张</t></p></s>',
  'ppt/slides/slide2.xml':'<s><p><t>第一张</t></p></s>',
 }));
 await expect(preview.getByText('第一张',{exact:true})).toBeVisible();
 await preview.getByRole('button',{name:'下一页'}).click();
 await expect(preview.getByText('第二张',{exact:true})).toBeVisible();
});
test('XLSX 保留空列和缓存数值',async({page})=>{
 const preview=await open(page,'xlsx',office({
  'xl/workbook.xml':'<w xmlns:r="urn:r"><sheet name="数据" r:id="r1"/></w>',
  'xl/_rels/workbook.xml.rels':'<r><Relationship Id="r1" Target="worksheets/sheet1.xml"/></r>',
  'xl/sharedStrings.xml':'<s><si><t>现有值</t></si></s>',
  'xl/worksheets/sheet1.xml':'<s><row><c r="A1" t="s"><v>0</v></c><c r="C1"><f>1+2</f><v>3</v></c></row></s>',
 }));
 await expect(preview.getByRole('cell').nth(0)).toHaveText('现有值');
 await expect(preview.getByRole('cell').nth(1)).toHaveText('');
 await expect(preview.getByRole('cell').nth(2)).toHaveText('3');
});
test('本地 PDF worker 渲染并翻页',async({page})=>{
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 160] /Contents 5 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 160 120] /Contents 5 0 R >>',
  '<< /Length 22 >>\nstream\n0 0 100 100 re 0 g f\n\nendstream'];
 let content='%PDF-1.4\n';const offsets=[0];
 objects.forEach((object,index)=>{offsets.push(content.length);content+=`${index+1} 0 obj\n${object}\nendobj\n`;});
 const xref=content.length;
 content+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const preview=await open(page,'pdf',Buffer.from(content));
 const pixels=async(index:number)=>await preview.getByLabel(`PDF 第 ${index} 页`).evaluate((canvas:HTMLCanvasElement)=>{const pixel=canvas.getContext('2d')!.getImageData(20,canvas.height-30,1,1).data;return pixel[3]===255?pixel[0]:-1;});
 await expect.poll(()=>pixels(1)).toBe(0);
 await preview.getByRole('button',{name:'下一页'}).click();
 await expect.poll(()=>pixels(2)).toBe(0);
});

test('视频卡片抽真实帧，窄窗播放条和元数据各占一行',async({page})=>{
 await page.setViewportSize({width:340,height:420});
 await page.goto('/tests/harness.html');
 await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=80;canvas.height=160;
   const context=canvas.getContext('2d')!;
   const stream=canvas.captureStream(20),recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
   const chunks:Blob[]=[];
   recorder.ondataavailable=event=>chunks.push(event.data);
   const recorded=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});
   recorder.start();
   const interval=setInterval(()=>{context.fillStyle='#ad5038';context.fillRect(0,0,80,160);},35);
   await new Promise(resolve=>setTimeout(resolve,500));
   recorder.stop();clearInterval(interval);stream.getTracks().forEach(track=>track.stop());await recorded;
   const reader=new FileReader();
   const url=await new Promise<string>(resolve=>{reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
   localStorage.setItem('test-state',JSON.stringify({shelves:[{id:1,name:'灵感收集',kind:'persistent',available:true}],items:[{id:1,name:'竖屏.webm',kind:'webm',path:'SYNTHETIC/竖屏.webm',shelf_id:1,bytes:200,status:'normal',modified:1,tags:[]}],jobs:[]}));
   localStorage.setItem('test-previews',JSON.stringify({1:{kind:'video',url,ticket:'fixture-video'}}));
 });
 await page.reload();
 const item=page.getByRole('button',{name:'选择 竖屏.webm',exact:true});
 await expect.poll(()=>page.locator('.thumb img[src^="data:image/jpeg"]').count()).toBeGreaterThan(0);
 await item.click();await page.keyboard.press('Space');
 const preview=page.getByRole('dialog',{name:'快速预览'});
 await expect(preview.getByText('80 × 160 px')).toBeVisible();
 const player=(await preview.getByRole('group',{name:'播放控制'}).boundingBox())!;
 const metadata=(await preview.locator('.preview-summary').boundingBox())!;
 expect(player.y+player.height).toBeLessThan(metadata.y);
 expect(await preview.getByLabel('视频预览').evaluate((video:HTMLVideoElement)=>video.paused)).toBe(true);
});
