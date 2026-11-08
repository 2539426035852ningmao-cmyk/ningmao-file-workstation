import {test,expect} from "@playwright/test";

for(const theme of ["light","dark","blue"])test(`错误语义色在 ${theme} 可读且不触发网络`,async({page})=>{
  await page.setViewportSize({width:340,height:320});
  await page.addInitScript(value=>localStorage.setItem("ningmao-theme",value),theme);
  await page.goto("/tests/harness.html");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();
  await page.getByRole("menuitem",{name:"文件互传",exact:true}).click();
  const panel=page.getByRole("dialog",{name:"文件互传",exact:true});
  await panel.getByRole("tab",{name:"发送文件",exact:true}).click();
  await panel.getByLabel("粘贴对方的连接信息").fill("not-a-connection");
  const alert=panel.getByRole("alert");await expect(alert).toContainText("请对方重新复制");
  await expect(alert).toBeInViewport({ratio:1});
  await expect(panel.getByLabel("粘贴对方的连接信息")).toBeInViewport({ratio:1});
  const colors=await alert.evaluate(e=>{
    const root=getComputedStyle(document.documentElement),context=document.createElement("canvas").getContext("2d")!;
    function rgb(value:string){context.fillStyle=value;context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data).slice(0,3);}
    return {token:root.getPropertyValue("--danger-text").trim(),foreground:rgb(getComputedStyle(e).color),background:rgb(getComputedStyle(e).backgroundColor)};
  });
  expect(colors.token).not.toBe("");
  const luminance=(rgb:number[])=>rgb.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  const a=luminance(colors.foreground),b=luminance(colors.background);
  expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);
  expect(await page.evaluate(()=>window.transferHarness.calls())).toEqual([]);
  await page.screenshot({path:`${process.env.M105_TEST_OUTPUT||"test-results"}/semantic-error-${theme}.png`});
});
