import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createRoomServer } from "../../selfhost/server.mjs";

test("好友确认后可私聊、固定文件群可来回查看文字及收发文件", async ({ browser }) => {
  const dir = await mkdtemp(join(tmpdir(), "ningmao-fixed-room-"));
  const station = createRoomServer(dir, undefined, 16 * 1024 * 1024).listen(0, "127.0.0.1");
  await once(station, "listening");
  const origin = `http://127.0.0.1:${(station.address() as { port: number }).port}`;
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()));
  try {
    const [a, b, outsider] = await Promise.all(contexts.map(context => context.newPage()));
    for (const [index, page] of [a, b, outsider].entries()) {
      expect((await page.request.post(origin + "/api/account/register", {
        data: { username: ["测试甲", "测试乙", "区外人"][index], password: "synthetic friend test only" }
      })).status()).toBe(201);
    }
    await a.goto(origin + "/social");
    await a.getByLabel("好友账号名").fill("测试乙");
    await a.getByRole("button", { name: "发送好友申请" }).click();
    await expect(a.getByText("等待对方确认")).toBeVisible();
    await b.goto(origin + "/social");
    await b.getByRole("button", { name: "同意好友申请" }).click();
    await a.getByRole("button", { name: "打开私聊" }).click();
    await expect(a.getByRole("heading", { level: 1, name: "测试乙" })).toBeVisible();
    const privateCode = new URL(a.url()).searchParams.get("code");
    const visiting = await outsider.request.get(origin + "/api/social/messages?room=" + privateCode);
    expect(visiting.status()).toBe(403);
    await a.getByLabel("消息", { exact: true }).fill("这份素材已经整理好。");
    await a.getByRole("button", { name: "发送消息" }).click();
    await b.getByRole("link", { name: /测试甲.*私聊/ }).click();
    await expect(b.getByText("这份素材已经整理好。")).toBeVisible();
    await b.reload();
    await expect(b.getByText("这份素材已经整理好。")).toBeVisible();

    await a.getByRole("link", { name: "好友与文件群" }).click();
    await a.getByRole("button", { name: "创建固定文件群" }).click();
    await a.getByLabel("群名称").fill("合成设计群");
    await a.getByRole("checkbox", { name: "测试乙" }).check();
    await a.getByRole("button", { name: "建群" }).click();
    await expect(a.getByRole("heading", { level: 1, name: "合成设计群" })).toBeVisible();
    const groupLink = a.url();
    const groupCode = new URL(groupLink).searchParams.get("code");
    expect((await outsider.request.get(origin + "/api/rooms/" + groupCode)).status()).toBe(403);
    await b.goto(groupLink);
    await expect(b.getByRole("heading", { level: 1, name: "合成设计群" })).toBeVisible();
    const bytes = Buffer.from("synthetic group design file");
    await a.getByLabel("选择文件").setInputFiles({ name: "群样本.txt", mimeType: "text/plain", buffer: bytes });
    await a.getByRole("button", { name: "发给全区 2 人" }).click();
    const file = b.waitForEvent("download");
    await b.getByRole("button", { name: "保存 群样本.txt" }).click();
    expect(await readFile(await (await file).path())).toEqual(bytes);

    await a.getByText("文件群成员 2 / 5 人", { exact: true }).click();
    await a.getByRole("button", { name: "设为管理员" }).click();
    await a.getByText("群管理交接", { exact: true }).click();
    await a.getByLabel("备用管理员").selectOption({ label: "测试乙" });
    await a.getByRole("button", { name: "指定备用管理员" }).click();
    await a.close();
    await b.getByText("群管理交接", { exact: true }).click();
    await b.getByRole("button", { name: "继续群管理" }).click();
    await expect(b.getByText("值守管理员正在管理此群。")).toBeVisible();
    const roomApi = origin + "/api/rooms/" + groupCode;
    const application = await outsider.request.post(roomApi + "/join", { data: {} });
    const pending = (await application.json()).member;
    expect(pending.status).toBe("pending");
    expect((await contexts[0].request.post(roomApi + "/decide", { data: { id: pending.id, accept: true } })).status()).toBe(403);
    await b.getByRole("button", { name: "批准", exact: true }).click();
    expect((await outsider.request.get(roomApi)).status()).toBe(200);
    await b.getByRole("button", { name: "交回群主管理" }).click();
    await expect(b.getByRole("button", { name: "继续群管理" })).toBeVisible();
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    station.closeAllConnections();
    await new Promise<void>(resolve => station.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
