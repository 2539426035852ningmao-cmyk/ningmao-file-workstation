import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import path from "node:path";


test("入口切换全局主题、双眼无按钮语义、减少动态效果仍可使用",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/tests/harness.html?desktop-entry");
  const face=page.locator(".orb-face").first();await expect(face.locator("path")).toHaveCount(2);
  await expect(face).toHaveAttribute("aria-hidden","true");
  await page.evaluate(()=>{localStorage.setItem("ningmao-theme","dark");window.dispatchEvent(new StorageEvent("storage",{key:"ningmao-theme"}));});
  await expect(page.locator("[data-orb-appearance='navy-black']").first()).toBeVisible();
  await page.evaluate(()=>{localStorage.setItem("ningmao-theme","light");window.dispatchEvent(new StorageEvent("storage",{key:"ningmao-theme"}));});
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.evaluate(()=>{localStorage.setItem("ningmao-theme","dark");window.dispatchEvent(new StorageEvent("storage",{key:"ningmao-theme"}));});
  await expect(page.getByRole("button",{name:"展开 灵感收集",exact:true})).toBeVisible();
  const flat=await page.locator(".orb-body").first().evaluate(el=>{const css=getComputedStyle(el);return {background:css.backgroundColor,image:css.backgroundImage,border:css.borderTopWidth,shadow:css.boxShadow};});
  expect(flat.background).toBe("rgb(32, 38, 48)");expect(flat.image).toBe("none");expect(flat.shadow).not.toBe("none");
  await page.reload();
  await expect(page.locator("[data-orb-appearance='navy-black']").first()).toBeVisible();
});
test("原生锁定时小球和分页保持目标 解除后显示真实任务状态",async({page})=>{
 await page.goto('/tests/harness.html?desktop-entry');const orb=page.getByRole('button',{name:'展开 灵感收集',exact:true}),before=await orb.boundingBox();
 await page.evaluate(()=>window.testHarness.nativeDrag(true,1));await expect(orb).toBeDisabled();await expect(page.getByRole('button',{name:'下一页文件架'})).toBeDisabled();
 await page.keyboard.press('Escape');expect(await orb.boundingBox()).toEqual(before);
 await page.evaluate(()=>{window.testHarness.nativeDrag(false);window.testHarness.notifyCopying(true);});await expect(page.getByRole('status',{name:'有复制任务进行中'})).toBeVisible();
 await page.evaluate(()=>{window.testHarness.notifyCopying(false);window.testHarness.notifyFinished('复制完成 来源保留');});await expect(page.getByRole('status',{name:'复制完成 来源保留'})).toBeVisible();
 await orb.click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain('expand:1');
});

test("子窗口表情及关闭按钮用于收回，保留当前架数据",async({page})=>{
  await page.goto("/tests/harness.html?shelf=1");await expect(page.getByRole("status").last()).toContainText("文件架已恢复");
  const before=await page.evaluate(()=>localStorage.getItem("test-state"));
  await expect(page.getByRole("button",{name:"表情 收回子窗口",exact:true})).toBeVisible();
  await expect(page.locator(".shelf-face-control > .brand-eyes")).toHaveAttribute("aria-hidden","true");
  await page.getByRole("button",{name:"收回子窗口",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("merge:1");
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

test("三套全局主题的小球与完整架证据（不是Windows原生）",async({page})=>{
  const folder=process.env.ORB_EVIDENCE;if(folder)mkdirSync(folder,{recursive:true});
  await page.setViewportSize({width:420,height:520});
  await page.addInitScript(()=>localStorage.removeItem("test-desktop-layout"));
  for(const theme of ["dark","light","blue"]){
    await page.goto("/tests/harness.html?desktop-entry&count=1");
    await page.evaluate(theme=>{localStorage.setItem("ningmao-theme",theme);window.dispatchEvent(new StorageEvent("storage",{key:"ningmao-theme"}));},theme);
    await page.getByRole("button",{name:"展开 灵感收集",exact:true}).press("Escape");
    const shot=async(name:string)=>{if(folder){await page.mouse.click(400,500);await page.waitForTimeout(320);await page.locator("nav[aria-label='悬浮文件架入口']").screenshot({path:path.join(folder,`${theme}-${name}.png`),omitBackground:true,animations:"disabled"});}};
    await shot("orb");await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
    await page.goto("/tests/harness.html");await expect(page.getByRole("status").last()).toContainText("文件架已恢复");
    if(folder)await page.locator(".workstation").screenshot({path:path.join(folder,`${theme}-shelf.png`)});
  }
});

for(const count of [1,3,8])test(`${count} 架紧凑入口保持直接打开能力`,async({page})=>{
  await page.goto(`/tests/harness.html?desktop-entry&count=${count}`);
  await expect(page.getByRole("button",{name:/^展开 /})).toHaveCount(Math.min(count,5));
  if(process.env.ORB_EVIDENCE)await page.locator("nav").screenshot({path:path.join(process.env.ORB_EVIDENCE,`dock-${count}-shelves.png`),omitBackground:true});
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
  if(count===8){await page.getByRole("button",{name:"下一页文件架"}).click();await page.getByRole("button",{name:"展开 项目 8",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:8");}
});

test("复制失败转入完整文件架处理，不复活轻预览",async({page})=>{
  await page.goto("/tests/harness.html?desktop-entry");
  await page.evaluate(()=>window.testHarness.notifyFinished("复制有错误；已完成 0/1 项，来源保留。合成目标不可写，请更换目录。"));
  await page.getByRole("button",{name:/复制有错误/}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
  await expect(page.locator(".quick-peek")).toHaveCount(0);
});

test("原创眨眼在低频触发后恢复，不留下持续帧循环",async({page})=>{
  await page.addInitScript(()=>{Math.random=()=>0;});
  await page.goto("/tests/harness.html?desktop-entry&count=1");
  const face=page.locator(".orb-face");
  await expect.poll(async()=>Number(await face.evaluate(el=>el.style.getPropertyValue("--eye-open") || "1")),{timeout:7000,intervals:[20]}).toBeLessThan(.7);
  await expect.poll(async()=>Number(await face.evaluate(el=>el.style.getPropertyValue("--eye-open") || "1"))).toBe(1);
  await page.getByRole("button",{name:"展开 灵感收集",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain("expand:1");
});
test("小球接收回执有无障碍名称并可直接查看完整架",async({page})=>{
 await page.goto('/tests/harness.html?desktop-entry&count=1');const full='已接收 1 项 来源保留';await page.evaluate(message=>window.testHarness.notifyFinished(message),full);
 await expect(page.getByRole('status',{name:full,exact:true})).toBeVisible();await expect(page.locator('.orb-receipt')).not.toHaveAttribute('title');
 await page.getByRole('button',{name:'展开 灵感收集',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.testHarness.calls())).toContain('expand:1');
});
