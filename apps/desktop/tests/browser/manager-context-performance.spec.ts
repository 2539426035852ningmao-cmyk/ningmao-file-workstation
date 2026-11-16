import {expect,test,type Page} from "@playwright/test";

async function setup(page:Page){
  await page.addInitScript(()=>{
    const items=Array.from({length:2000},(_,i)=>({id:i+1,shelf_id:1,name:`Fixture-${String(i).padStart(4,"0")}.txt`,path:`SYNTHETIC/${i}.txt`,kind:"txt",bytes:200,modified:1,status:"normal",tags:["合成标签"]}));
    localStorage.setItem("test-state",JSON.stringify({shelves:[{id:1,name:"合成收集架",kind:"persistent",root:null,available:true}],items,jobs:[{id:1,shelf_id:1,status:"copying",message:"合成复制任务",staging:null}]}));
    const original=Array.prototype.flatMap;
    const stats={calls:0,items:0,mappingMs:0};
    (window as unknown as {tagStats:typeof stats}).tagStats=stats;
    Array.prototype.flatMap=function(...args:Parameters<typeof original>){
      // Count only the fixture's full metadata array, not React or other arrays.
      if(this.length!==2000||this[0]?.name!=="Fixture-0000.txt")return Reflect.apply(original,this,args);
      const start=performance.now();const result=Reflect.apply(original,this,args);
      stats.calls++;stats.items+=this.length;stats.mappingMs+=performance.now()-start;return result;
    };
  });
  await page.goto("/tests/harness.html?manager");
  await expect(page.getByRole("heading",{name:"文件与素材",exact:true})).toBeVisible();
}

test("从任务和设置返回上次文件分类，素材筛选选择分页及标签入口保留",async({page},info)=>{
  await setup(page);
  await page.getByRole("button",{name:"素材",exact:true}).click();
  await page.getByRole("textbox",{name:"搜索已收集素材"}).fill("Fixture");
  await page.getByRole("combobox",{name:"素材标签"}).selectOption("合成标签");
  await page.getByRole("button",{name:"下一页",exact:true}).click();
  await page.getByRole("checkbox",{name:"选择 Fixture-0100.txt",exact:true}).check();
  const before=await page.evaluate(()=>localStorage.getItem("test-state"));
  await page.getByRole("button",{name:"任务中心",exact:true}).click();
  await page.getByRole("button",{name:"设置",exact:true}).click();
  await page.getByRole("button",{name:"文件与素材",exact:true}).click();
  const returned=await page.getByRole("textbox",{name:"搜索已收集素材"}).count();
  console.log("manager-return",JSON.stringify({returnedToAssets:!!returned,extraClassificationClicks:returned?0:1}));
  await page.screenshot({path:info.outputPath("manager-return.png"),animations:"disabled"});
  await expect(page.getByRole("textbox",{name:"搜索已收集素材"})).toHaveValue("Fixture");
  await expect(page.getByRole("combobox",{name:"素材标签"})).toHaveValue("合成标签");
  await expect(page.getByRole("checkbox",{name:"选择 Fixture-0100.txt",exact:true})).toBeChecked();
  await expect(page.getByText("2000 项 · 第 2/20 页",{exact:true})).toBeVisible();
  // Re-selecting the active primary section also preserves the current task.
  await page.getByRole("button",{name:"文件与素材",exact:true}).click();
  await expect(page.getByRole("checkbox",{name:"选择 Fixture-0100.txt",exact:true})).toBeChecked();
  await page.getByRole("button",{name:"标签",exact:true}).click();
  await page.getByRole("button",{name:"任务中心",exact:true}).click();
  await page.getByRole("button",{name:"文件与素材",exact:true}).click();
  await expect(page.getByRole("button",{name:"合成标签 2000 项",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem("test-state"))).toBe(before);
});

test("16次进度更新不重复汇总未变的2000项标签，元数据更新仍刷新标签",async({page},info)=>{
  await setup(page);
  await page.getByRole("button",{name:"任务中心",exact:true}).click();
  const progress=page.getByRole("progressbar",{name:"当前文件复制进度"});
  await page.evaluate(()=>window.testHarness.notifyProgress({job_id:1,name:"合成.bin",file_index:1,file_count:1,bytes:1,total:100}));
  await expect(progress).toHaveAttribute("value","1");
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const initial=await page.evaluate(()=>({stats:{...(window as unknown as {tagStats:{calls:number;items:number;mappingMs:number}}).tagStats},reads:window.testHarness.calls().filter(x=>x==="management-snapshot").length}));
  for(let bytes=2;bytes<=17;bytes++){
    await page.evaluate(bytes=>window.testHarness.notifyProgress({job_id:1,name:"合成.bin",file_index:1,file_count:1,bytes,total:100}),bytes);
    await expect(progress).toHaveAttribute("value",String(bytes));
  }
  const final=await page.evaluate(()=>({stats:{...(window as unknown as {tagStats:{calls:number;items:number;mappingMs:number}}).tagStats},reads:window.testHarness.calls().filter(x=>x==="management-snapshot").length}));
  const metrics={progressUpdates:16,tagSummaries:final.stats.calls-initial.stats.calls,itemsMapped:final.stats.items-initial.stats.items,mappingMs:final.stats.mappingMs-initial.stats.mappingMs,extraSnapshots:final.reads-initial.reads};
  console.log("manager-progress",JSON.stringify(metrics));
  await info.attach("manager-progress.json",{body:JSON.stringify(metrics),contentType:"application/json"});
  expect(metrics.tagSummaries).toBe(0);expect(metrics.extraSnapshots).toBe(0);
  await page.evaluate(async()=>{await window.testHarness.tags(1,["新标签"]);window.testHarness.notifyMetadata();});
  await page.getByRole("button",{name:"文件与素材",exact:true}).click();
  await page.getByRole("button",{name:"素材",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"素材标签"}).getByRole("option",{name:"新标签",exact:true})).toHaveCount(1);
});
