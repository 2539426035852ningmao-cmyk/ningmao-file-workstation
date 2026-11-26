import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createRoomServer } from "../../selfhost/server.mjs";

test("全区为默认，指定两人时只有他们能保存", async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), "ningmao-directed-room-"));
  const server = createRoomServer(root, undefined, 8 * 1024 * 1024).listen(0, "127.0.0.1");
  await once(server, "listening");
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  try {
    const [owner, ...guests] = await Promise.all(contexts.map(context => context.newPage()));
    await owner.goto(`http://127.0.0.1:${server.address().port}/rooms`);
    await owner.getByLabel("显示名称").fill("房主");
    await owner.getByRole("button", { name: "创建互传区" }).click();
    const invite = await owner.getByLabel("邀请链接", { exact: true }).inputValue();
    await Promise.all(guests.map(async (page, index) => {
      await page.goto(invite);
      await page.getByLabel("显示名称").fill("成员 " + (index + 1));
      await page.getByRole("button", { name: "加入互传区" }).click();
    }));
    await expect(owner.getByText("文件群成员 4 / 5 人")).toBeVisible();
    const payload = Buffer.from("只有指定成员能领取的合成来件");
    const chooseFile = (name: string) => owner.getByLabel("选择文件").setInputFiles({
      name, mimeType: "text/plain", buffer: payload,
    });
    const scope = owner.getByRole("combobox", { name: "发送范围" });
    await expect(scope).toHaveValue("all");
    await chooseFile("指定.txt");
    await scope.selectOption("selected");
    await expect(owner.getByRole("button", { name: "发送给 0 人" })).toBeDisabled();
    await owner.getByRole("checkbox", { name: "成员 1" }).check();
    await owner.getByRole("checkbox", { name: "成员 2" }).check();
    await expect(owner.getByText("发给 成员 1、成员 2")).toBeVisible();

    // A station that ignores the new audience must never receive file bytes.
    let chunk = false;
    owner.on("request", request => {
      if (/\/bulk\/[a-f0-9]{32}$/.test(request.url()) && request.method() === "POST") chunk = true;
    });
    const opening = /\/api\/rooms\/[a-f0-9]{32}\/bulk$/;
    await owner.route(opening, async route => {
      const response = await route.fetch();
      const { recipients: _ignored, ...oldReceipt } = await response.json();
      await route.fulfill({ response, json: oldReceipt });
    });
    await owner.getByRole("button", { name: "发送给 2 人" }).click();
    await expect(owner.getByRole("alert")).toHaveText("站点未确认发送范围，文件尚未上传。");
    expect(chunk).toBe(false);
    await owner.unroute(opening);
    await owner.getByRole("button", { name: "续传原文件" }).click();

    for (const target of guests.slice(0, 2)) {
      const download = target.waitForEvent("download");
      await target.getByRole("button", { name: "保存 指定.txt" }).click();
      expect(await readFile(await (await download).path())).toEqual(payload);
    }
    await guests[2].reload();
    await expect(guests[2].getByRole("heading", { name: "共享文件" })).toBeVisible();
    await expect(guests[2].getByRole("button", { name: "保存 指定.txt" })).toHaveCount(0);
    await scope.selectOption("all");
    await chooseFile("全区.txt");
    await owner.getByRole("button", { name: "发给全区 4 人" }).click();
    await expect(guests[2].getByRole("button", { name: "保存 全区.txt" })).toBeVisible();
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
