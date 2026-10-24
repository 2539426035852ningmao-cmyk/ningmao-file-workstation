import { test,expect,type Page } from "@playwright/test";
import type { Item } from "../../src/backend";
import { mkdirSync } from "node:fs";
import path from "node:path";
const key="ningmao-shelf-views";
const sample=(id:number,name:string,kind:string,bytes:number,modified:number,status="normal"):Item=>({id,name,kind,bytes,modified,status,shelf_id:1,path:"SYNTHETIC/"+id+"/"+name,tags:[]});
const items=[sample(41,"素材10.txt","txt",900,200),sample(42,"素材2.png","png",500,250),sample(43,"空文件.txt","txt",0,300),sample(44,"失效.txt","file",0,0,"missing"),sample(45,"资料目录","folder",4096,100),sample(46,"素材1.txt","txt",900,200),sample(47,"不可读取.txt","file",0,0,"unreadable"),sample(48,"无日期.txt","txt",300,0)];
async function setup(page:Page){
  await page.setViewportSize({width:420,height:720});
  await page.addInitScript(({items,key})=>{
    if(localStorage.getItem("test-state")===null)localStorage.setItem("test-state",JSON.stringify({shelves:[{id:1,name:"灵感收集",kind:"persistent",root:null,available:true},{id:2,name:"本次中转",kind:"session",root:null,available:true}],items,jobs:[]}));
    if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify({version:1,shelves:{"1":{list:true,sort:"manual",size:60},"2":{list:false,sort:"name",size:120}}}));
  },{items,key});
  await page.goto("/tests/harness.html");await expect(page.locator("[data-item-id]")).toHaveCount(8);
}
async function choose(page:Page,name:string){await page.getByRole("button",{name:"更多操作",exact:true}).click();await expect(page.getByRole("menuitemradio",{name,exact:true})).toBeVisible({timeout:3000});await page.getByRole("menuitemradio",{name,exact:true}).click();}
async function order(page:Page){return page.locator("[data-item-id]").evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute("data-item-id"))));}
async function capture(page:Page,name:string){const evidence=process.env.SORT_EVIDENCE;if(evidence){mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+".png")});}}

test("时间、大小、类型和自然名称排序只改变显示，失效元数据后置，手动顺序不丢失",async({page})=>{
  await setup(page);const original=await page.evaluate(()=>localStorage.getItem("test-state"));
  await choose(page,"最近修改");expect((await order(page)).slice(0,5)).toEqual([45,43,42,46,41]);
  expect(new Set((await order(page)).slice(5))).toEqual(new Set([44,47,48]));
  await expect(page.locator(".drag-handle:enabled")).toHaveCount(0);
  await choose(page,"大小从大到小");expect(await order(page)).toEqual([45,46,41,42,48,43,47,44]);
  await page.setViewportSize({width:420,height:520});
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitemradio",{name:"大小从大到小",exact:true}).focus();await capture(page,"sort-420-dark");await page.keyboard.press("Escape");
  await page.setViewportSize({width:420,height:720});
  await choose(page,"类型排序");expect((await order(page)).slice(0,2)).toEqual([45,42]);expect(new Set((await order(page)).slice(-2))).toEqual(new Set([44,47]));
  await choose(page,"名称排序");expect((await order(page)).filter(id=>[41,42,46].includes(id))).toEqual([46,42,41]);
  await choose(page,"手动顺序");expect(await order(page)).toEqual(items.map(i=>i.id));
  await expect(page.locator(".drag-handle:enabled")).toHaveCount(8);
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
  expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(original);
});

test("旧v1设置不在启动覆盖，修改后升到v2，切架和重载分别恢复排序",async({page})=>{
  await setup(page);expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).version,key)).toBe(1);
  await choose(page,"最近修改");
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
  expect(saved).toEqual({version:2,shelves:{"1":{list:true,sort:"modified",size:60},"2":{list:false,sort:"name",size:120}}});
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name:"本次中转",exact:true}).click();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await expect(page.getByRole("menuitemradio",{name:"名称排序",exact:true})).toHaveAttribute("aria-checked","true");await page.keyboard.press("Escape");
  await choose(page,"类型排序");await page.reload();
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await expect(page.getByRole("menuitemradio",{name:"类型排序",exact:true})).toHaveAttribute("aria-checked","true");await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"切换文件架",exact:true}).click();await page.getByRole("menuitemradio",{name:"灵感收集",exact:true}).click();
  await expect.poll(async()=>(await order(page)).slice(0,5)).toEqual([45,43,42,46,41]);
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await expect(page.getByRole("menuitemradio",{name:"最近修改",exact:true})).toHaveAttribute("aria-checked","true");await page.keyboard.press("Escape");
  expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).shelves["2"].sort).toBe("type");
  expect(await page.evaluate(()=>window.testHarness.calls())).toEqual([]);
});

test("自动排序与搜索、刷新兼容，相同值按名称及稳定ID排序",async({page})=>{
  await setup(page);await choose(page,"大小从大到小");
  await page.keyboard.press("Control+f");const input=page.getByRole("textbox",{name:"搜索文件",exact:true});await input.fill("素材");
  expect(await order(page)).toEqual([46,41,42]);await expect(page.locator(".drag-handle:enabled")).toHaveCount(0);await input.press("Escape");
  const before=await order(page);
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"刷新文件状态",exact:true}).click();
  expect(await order(page)).toEqual(before);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("test-state")!));
  state.items=[sample(52,"同名.txt","txt",3,10),sample(51,"同名.txt","txt",3,10)];
  await page.evaluate(state=>localStorage.setItem("test-state",JSON.stringify(state)),state);await page.reload();
  await expect.poll(()=>order(page)).toEqual([51,52]);await choose(page,"手动顺序");expect(await order(page)).toEqual([52,51]);
});

test("窄窗新增排序可用键盘选中且菜单末项仍可到达",async({page})=>{
  await setup(page);await page.getByRole("button",{name:"更多操作",exact:true}).click();await page.getByRole("menuitem",{name:"切换浅色主题",exact:true}).click();await page.setViewportSize({width:340,height:320});
  await page.getByRole("button",{name:"更多操作",exact:true}).press("Enter");
  const option=page.getByRole("menuitemradio",{name:"大小从大到小",exact:true});await option.focus();await page.keyboard.press("Enter");
  await page.getByRole("button",{name:"更多操作",exact:true}).click();await expect(option).toHaveAttribute("aria-checked","true");
  await option.focus();await capture(page,"sort-340-light");
  const menu=page.getByRole("menu",{name:"更多操作",exact:true});await menu.press("End");await expect(page.getByRole("menuitem",{name:"完整退出",exact:true})).toBeFocused();
  await page.keyboard.press("Escape");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
