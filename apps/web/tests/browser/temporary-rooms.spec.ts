import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createRoomServer } from "../../selfhost/server.mjs";

test("两份独立浏览器配置经自托管站点双向收发并校验落盘", async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), "ningmao-browser-room-"));
  const server = createRoomServer(root).listen(0, "127.0.0.1");
  await once(server, "listening");
  const owner = await browser.newContext();
  const guest = await browser.newContext();
  try {
    const hostPage = await owner.newPage();
    const guestPage = await guest.newPage();
    // The Android test image can ship Chrome without AbortSignal.any.
    await guestPage.addInitScript(() => {
      Object.defineProperty(AbortSignal, "any", { value: undefined });
    });
    await hostPage.goto(`http://127.0.0.1:${server.address().port}`);
    await hostPage.getByLabel("显示名称").fill("甲");
    await hostPage.getByLabel("入区需批准").check();
    await hostPage.getByRole("button", { name: "创建互传区" }).click();
    const invitation = await hostPage.getByLabel("邀请链接", { exact: true }).inputValue();
    await hostPage.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: async (value: string) => sessionStorage.setItem("room-invitation-copy", value),
      });
    });
    await hostPage.getByRole("button", { name: "复制邀请链接" }).click();
    expect(await hostPage.evaluate(() => sessionStorage.getItem("room-invitation-copy"))).toBe(invitation);
    await guestPage.goto(new URL("/rooms", invitation).href);
    await guestPage.getByRole("button", { name: "有邀请链接" }).click();
    await guestPage.getByLabel("邀请链接或邀请码").fill(invitation);
    await guestPage.getByLabel("显示名称").fill("乙");
    await guestPage.getByRole("button", { name: "加入互传区" }).click();
    await expect(guestPage.getByText("等待群主或管理员批准加入。")).toBeVisible();
    await hostPage.getByRole("button", { name: "批准", exact: true }).click();
    await expect(guestPage.getByRole("heading", { name: "共享文件" })).toBeVisible();

    for (const [sender, recipient, name] of [
      [hostPage, guestPage, "甲到乙.txt"],
      [guestPage, hostPage, "乙到甲.txt"],
    ] as const) {
      const source = Buffer.from(`合成文件 ${name}`);
      await sender.getByLabel("选择文件").setInputFiles({ name, mimeType: "text/plain", buffer: source });
      await sender.getByRole("button", { name: "发给全区 2 人" }).click();
      const download = recipient.waitForEvent("download");
      await recipient.getByRole("button", { name: `保存 ${name}` }).click();
      const saved = await download;
      expect(saved.suggestedFilename()).toBe(name);
      const path = join(root, name);
      await saved.saveAs(path);
      const bytes = await readFile(path);
      expect(bytes.byteLength).toBe(source.byteLength);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(createHash("sha256").update(source).digest("hex"));
      sender.once("dialog", dialog => dialog.accept());
      await sender.locator("article").filter({ hasText: name }).getByRole("button", { name: "撤回" }).click();
      await expect(recipient.getByRole("button", { name: `保存 ${name}` })).toHaveCount(0);
    }

    const roomPath = /\/api\/rooms\/[a-f0-9]{32}$/;
    const send = guestPage.getByRole("button", { name: "发给全区 2 人" });
    await guestPage.getByLabel("选择文件").setInputFiles({
      name: "重连后发送.txt", mimeType: "text/plain", buffer: Buffer.from("待发送的合成文件"),
    });
    for (const outage of ["unreachable", "maintenance"]) {
      await guestPage.route(roomPath, route => outage === "unreachable"
        ? route.abort() : route.fulfill({ status: 503, body: "maintenance" }));
      await expect(guestPage.getByRole("alert")).toContainText("互传站点暂时无法连接");
      await expect(guestPage.getByRole("heading", { name: "共享文件" })).toBeVisible();
      await expect(send).toBeDisabled();
      await guestPage.unroute(roomPath);
      await expect(guestPage.getByRole("alert")).toHaveCount(0);
      await expect(send).toBeEnabled();
    }
    await send.click();
    await expect(hostPage.getByRole("button", { name: "保存 重连后发送.txt" })).toBeVisible();
  } finally {
    await Promise.all([owner.close(), guest.close()]);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
