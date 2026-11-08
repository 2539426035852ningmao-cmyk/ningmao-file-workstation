import {expect,test} from "@playwright/test";
test("W3 Windows 端经原生命令存储校验合成内容并报告 persisted job",async({page})=>{
  await page.goto("/tests/harness.html");
  const result=await page.evaluate(()=>window.verifyDesktopWebReceive("valid"));
  expect(result.error).toBeNull();
  expect(result.receipt).toBe("completed");
  expect(result.calls).toEqual([
    "web_receive_prepare","web_receive_append","web_receive_finish"
  ]);
});
test("W3 未通过 SHA 的网页文件不允许触发任何原生写入",async({page})=>{
  await page.goto("/tests/harness.html");
  const result=await page.evaluate(()=>window.verifyDesktopWebReceive("bad-hash"));
  expect(result.error).toContain("摘要不匹配");
  expect(result.calls).toEqual([]);
});
test("W3 异常块回执与用户取消均撤销临时文件授权",async({page})=>{
  await page.goto("/tests/harness.html");
  for(const mode of ["bad-ack","cancel"] as const){
    const result=await page.evaluate(m=>window.verifyDesktopWebReceive(m),mode);
    expect(result.receipt).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.calls.at(-1)).toBe("web_receive_abort");
    expect(result.calls).not.toContain("web_receive_finish");
  }
});
