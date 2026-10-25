import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import path from "node:path";

test("原创入口从球到胶囊到轻预览，明确打开与键盘返回",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry");
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await expect(page.getByTestId("morph-capsule")).toBeVisible();
  expect(await page.evaluate(()=>window.testHarness.calls())).not.toContain("expand:1");
  await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();
  await expect(page.getByRole("region",{name:"灵感收集 轻预览",exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"灵感收集 轻预览"}).getByTestId("peek-file")).toHaveCount(3);
  await page.keyboard.press("Escape");await expect(page.getByTestId("morph-capsule")).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByTestId("morph-capsule")).toHaveCount(0);
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).press("Control+Enter");
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
});

test("皮肤独立于主题、双眼无按钮语义、减少动态效果仍可使用",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/tests/harness.html?desktop-entry");
  const face=page.locator(".orb-face").first();await expect(face.locator("path")).toHaveCount(2);
  await expect(face).toHaveAttribute("aria-hidden","true");
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();
  await page.getByRole("button",{name:"入口外观",exact:true}).click();
  await page.getByRole("radio",{name:"深蓝黑",exact:true}).check();
  await expect(page.locator("[data-orb-appearance='navy-black']").first()).toBeVisible();
  await page.evaluate(()=>{localStorage.setItem("ningmao-theme","light");window.dispatchEvent(new StorageEvent("storage",{key:"ningmao-theme"}));});
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.getByRole("radio",{name:"深蓝黑",exact:true})).toBeChecked();
  await page.keyboard.press("Escape");await page.keyboard.press("Escape");
  await expect(page.getByTestId("morph-capsule")).toBeVisible();
  const flat=await page.locator(".orb-body").first().evaluate(el=>{const css=getComputedStyle(el);return {background:css.backgroundColor,image:css.backgroundImage,border:css.borderTopWidth,shadow:css.boxShadow};});
  expect(flat).toEqual({background:"rgb(25, 30, 40)",image:"none",border:"0px",shadow:"none"});
  await page.reload();
  await expect(page.locator("[data-orb-appearance='navy-black']").first()).toBeVisible();
});

test("原生锁定信号保持形态和命中区，解除后成功文字可读",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry");await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  const before=await page.getByTestId("morph-capsule").boundingBox();
  await page.evaluate(()=>window.testHarness.nativeDrag(true,1));
  await expect(page.getByTestId("morph-capsule")).toBeDisabled();
  await page.keyboard.press("Escape");expect(await page.getByTestId("morph-capsule").boundingBox()).toEqual(before);
  await expect(page.getByRole("button",{name:"下一页文件架"})).toBeDisabled();
  await page.evaluate(()=>{window.testHarness.nativeDrag(false);window.testHarness.notifyFinished("复制完成；已完成 1/1 项，来源保留。");});
  await expect(page.getByRole("status")).toContainText("复制完成");
  await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();
  await page.getByRole("button",{name:"打开文件架",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
});

test("完整架双眼为装饰，独立收起按钮只收当前架且保留数据",async({page})=>{
  await page.goto("/tests/harness.html?shelf=1");await expect(page.getByRole("status").last()).toContainText("文件架已恢复");
  const before=await page.evaluate(()=>localStorage.getItem("test-state"));
  expect(await page.locator(".shelf-header > .brand-eyes").evaluate(el=>el.closest("button"))).toBeNull();
  await expect(page.locator(".shelf-header > .brand-eyes")).toHaveAttribute("aria-hidden","true");
  await page.getByRole("button",{name:"收起到悬浮入口",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("collapse:1");
  expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(before);
});

for(const edge of ["left","right","top","bottom","free"] as const) {
  test(`Dock ${edge} 方向与分页保留明确文件架身份`,async({page})=>{
    await page.addInitScript(edge=>localStorage.setItem("test-desktop-layout",JSON.stringify({layout:{enabled:true,expanded:false,active_shelf:1,collapsed:[],page:0,preferences:{edge,flow:"horizontal",auto_hide:false,topmost:true}},entries:[],total:0,warning:null,copying:false,edge_hidden:false})),edge);
    await page.goto("/tests/harness.html?desktop-entry");
    const rects=await page.locator(".entry-slot").evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
    expect(rects).toHaveLength(5);expect(rects[1].x>rects[0].x).toBe(["top","bottom","free"].includes(edge));
    await page.getByRole("button",{name:"下一页文件架"}).click();await expect(page.getByRole("button",{name:/^展开 /})).toHaveCount(2);
  });
}

test("空架与失效文件的轻预览保留清晰语义，不增加虚假占位卡片",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry");await page.evaluate(()=>window.testHarness.missing(1));
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();
  await expect(page.getByText("状态待核对",{exact:true})).toBeVisible();await expect(page.getByText("仅保存引用",{exact:true})).toBeVisible();
  await page.keyboard.press("Escape");await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"展开 本次中转",exact:true}).click();await page.getByRole("button",{name:"查看 本次中转 轻预览",exact:true}).click();
  await expect(page.getByText("拖入文件，开始收集",{exact:true})).toBeVisible();await expect(page.getByTestId("peek-file")).toHaveCount(0);
});

test("动效只在需要时请求帧，隐藏后停止计时器与帧，非活动架不重复心跳",async({page})=>{
  await page.addInitScript(()=>{
    const probe={frames:0,timers:0,callbacks:0};Object.assign(window,{motionProbe:probe});
    const frames=new Set<number>(),timers=new Set<number>(),raf=requestAnimationFrame.bind(window),caf=cancelAnimationFrame.bind(window),timer=setTimeout.bind(window),clear=clearTimeout.bind(window);
    window.requestAnimationFrame=fn=>{const id=raf(time=>{frames.delete(id);probe.frames=frames.size;probe.callbacks++;fn(time);});frames.add(id);probe.frames=frames.size;return id;};
    window.cancelAnimationFrame=id=>{frames.delete(id);probe.frames=frames.size;caf(id);};
    window.setTimeout=((fn:TimerHandler,ms?:number,...args:unknown[])=>{if(typeof fn!=="function")return timer(fn,ms,...args);const id=timer(()=>{timers.delete(id);probe.timers=timers.size;fn(...args);},ms);timers.add(id);probe.timers=timers.size;return id;}) as typeof setTimeout;
    window.clearTimeout=id=>{if(id!==undefined)timers.delete(Number(id));probe.timers=timers.size;clear(id);};
  });
  await page.goto("/tests/harness.html?desktop-entry");await expect(page.locator(".orb-face")).toHaveCount(5);
  await page.mouse.move(21,22);await expect.poll(()=>page.locator(".orb-face").first().getAttribute("style")).toContain("--gaze-x");
  const probe=()=>page.evaluate(()=>(window as unknown as {motionProbe:{frames:number;timers:number;callbacks:number}}).motionProbe);
  await expect.poll(async()=>{const p=await probe();return p.frames;}).toBe(0);
  expect((await probe()).timers).toBeLessThanOrEqual(1);
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});
  await expect.poll(async()=>{const p=await probe();return p.frames+p.timers;}).toBe(0);
});

test("六组皮肤主题与四形态证据（合成浏览器，不是Windows原生）",async({page})=>{
  const folder=process.env.ORB_EVIDENCE;if(folder)mkdirSync(folder,{recursive:true});
  await page.setViewportSize({width:420,height:520});
  await page.addInitScript(()=>localStorage.removeItem("test-desktop-layout"));
  for(const theme of ["dark","light"])for(const skin of ["warm-white","navy-black","brand-blue"]){
    await page.goto("/tests/harness.html?desktop-entry&count=1");
    await page.evaluate(({theme,skin})=>{localStorage.setItem("ningmao-theme",theme);localStorage.setItem("ningmao-orb-appearance-v1",skin);window.dispatchEvent(new StorageEvent("storage",{key:null}));},{theme,skin});
    await page.getByRole("button",{name:"展开 灵感收集",exact:true}).press("Escape");
    const shot=async(name:string)=>{if(folder){await page.mouse.click(400,500);await page.waitForTimeout(320);await page.locator("nav[aria-label='悬浮文件架入口']").screenshot({path:path.join(folder,`${theme}-${skin}-${name}.png`),omitBackground:true,animations:"disabled"});}};
    await shot("orb");await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();await shot("capsule");
    await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();await expect(page.getByTestId("peek-file")).toHaveCount(3);await shot("peek");
    await page.goto("/tests/harness.html");await expect(page.getByRole("status").last()).toContainText("文件架已恢复");
    if(folder)await page.locator(".workstation").screenshot({path:path.join(folder,`${theme}-${skin}-shelf.png`)});
  }
});

for(const count of [1,3,8])test(`${count} 架紧凑入口及更多搜索`,async({page})=>{
  await page.goto(`/tests/harness.html?desktop-entry&count=${count}`);
  await expect(page.getByRole("button",{name:/^展开 /})).toHaveCount(Math.min(count,5));
  if(process.env.ORB_EVIDENCE)await page.locator("nav").screenshot({path:path.join(process.env.ORB_EVIDENCE,`dock-${count}-shelves.png`),omitBackground:true});
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();
  await page.getByRole("button",{name:"更多文件架",exact:true}).click();
  await expect(page.locator(".peek-catalog button")).toHaveCount(count);
  if(count===8){await page.getByRole("textbox",{name:"搜索文件架"}).fill("项目 8");await expect(page.locator(".peek-catalog button")).toHaveCount(1);await page.getByRole("button",{name:"项目 8",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:8");}
});

test("复制失败文字展开为可读错误，不冒充成功",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry");
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await page.evaluate(()=>window.testHarness.notifyFinished("复制有错误；已完成 0/1 项，来源保留。合成目标不可写，请更换目录。"));
  await expect(page.getByRole("region",{name:"灵感收集 轻预览",exact:true})).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("合成目标不可写，请更换目录");
  await expect(page.locator(".adaptive-dock")).toHaveAttribute("data-tone","error");
});

test("原创眨眼在低频触发后恢复，不留下持续帧循环",async({page})=>{
  await page.addInitScript(()=>{Math.random=()=>0;});
  await page.goto("/tests/harness.html?desktop-entry&count=1");
  const face=page.locator(".orb-face");
  await expect.poll(async()=>Number(await face.evaluate(el=>el.style.getPropertyValue("--eye-open") || "1")),{timeout:7000,intervals:[20]}).toBeLessThan(.7);
  await expect.poll(async()=>Number(await face.evaluate(el=>el.style.getPropertyValue("--eye-open") || "1"))).toBe(1);
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await page.mouse.move(170,35,{steps:8});
  await expect(page.getByTestId("morph-capsule")).toBeVisible();
});

test("胶囊接收反馈完整可见，详细文字保留在轻预览",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry&count=1");
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  const full="已接收 1 项；来源保留。";
  await page.evaluate(message=>window.testHarness.notifyFinished(message),full);
  const status=page.getByRole("status");
  await expect(status).toHaveText("已接收 1 项");
  expect(await status.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await expect(status).toHaveAttribute("title",full);
  await page.getByRole("button",{name:"查看 灵感收集 轻预览",exact:true}).click();
  await expect(page.getByRole("status")).toHaveText(full);
});
