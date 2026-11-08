import {expect,test} from "@playwright/test";

test("同一浏览器多个标签拥有独立在线会话，刷新保持自己的会话 ID", async ({context})=>{
  const ids:string[]=[];
  await context.route("**/api/me",route=>route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({id:"synthetic-sub",email:"tab-test@example.test"})
  }));
  await context.routeWebSocket(/\/api\/connect\?/,ws=>{
    ids.push(new URL(ws.url()).searchParams.get("device")||"");
  });
  const first=await context.newPage();
  const second=await context.newPage();
  await first.goto("/");
  await expect.poll(()=>ids.length).toBe(1);
  const firstId=ids[0];
  await second.goto("/");
  await expect.poll(()=>ids.length).toBe(2);
  const secondId=ids[1];
  expect(firstId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(secondId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(firstId).not.toBe(secondId);
  await first.reload();
  await expect.poll(()=>ids.length).toBe(3);
  expect(ids[2]).toBe(firstId);
  await Promise.all([first.close(),second.close()]);
});
