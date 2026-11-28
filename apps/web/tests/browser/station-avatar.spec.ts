import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createRoomServer } from "../../selfhost/server.mjs";

test("选择动物与上传照片可保存，房间头像随成员权限展示", async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), "ningmao-avatar-"));
  const station = createRoomServer(root).listen(0, "127.0.0.1");
  await once(station, "listening");
  const origin = `http://127.0.0.1:${station.address().port}`;
  const [owner, guest, outsider] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const page = await owner.newPage();
    const receiver = await guest.newPage();
    await owner.request.post(origin + "/api/account/register", {
      data: { username: "合成头像", password: "Synthetic avatar test passphrase" },
    });
    await page.goto(origin + "/account");
    const edit = page.getByRole("button", { name: "更改头像" });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "更改头像" });
    await expect(dialog.getByRole("group", { name: "内置动物头像" }).getByRole("button")).toHaveCount(24);
    await dialog.getByRole("button", { name: "水獭", exact: true }).click();
    await dialog.getByRole("button", { name: "保存头像" }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "当前账号" }).locator("[data-animal=otter]")).toBeVisible();

    await edit.click();
    const file = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 32;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#bf804f";
      context.fillRect(0, 0, 48, 32);
      context.fillStyle = "#fff0cd";
      context.fillRect(10, 5, 25, 18);
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    const update = origin + "/api/account/avatar";
    expect((await outsider.request.post(update, { data: { preset: "penguin" } })).status()).toBe(401);
    expect((await owner.request.post(update, { data: { preset: "missing" } })).status()).toBe(400);
    expect((await owner.request.post(update, { headers: { "Content-Type": "application/octet-stream" }, data: file })).status()).toBe(400);
    await dialog.getByLabel("上传图片").setInputFiles({ name: "合成头像.png", mimeType: "image/png", buffer: file });
    await expect(dialog.getByRole("img", { name: "待保存的头像" })).toBeVisible();
    await dialog.getByRole("button", { name: "保存头像" }).click();
    const photo = page.getByRole("region", { name: "当前账号" }).locator("img");
    await expect(photo).toHaveJSProperty("naturalWidth", 160);
    const profileImage = new URL((await photo.getAttribute("src"))!, origin);
    expect((await outsider.request.get(profileImage.href)).status()).toBe(404);

    await page.goto(origin + "/rooms");
    await page.getByRole("button", { name: "创建互传区" }).click();
    const invitation = await page.getByLabel("邀请链接", { exact: true }).inputValue();
    const creatorImage = page.locator(".room-context-bar img");
    await expect(creatorImage).toHaveJSProperty("naturalWidth", 160);
    const roomImage = new URL((await creatorImage.getAttribute("src"))!, origin);
    expect((await guest.request.get(roomImage.href)).status()).toBe(403);
    await receiver.goto(invitation);
    await receiver.getByLabel("显示名称").fill("访客头像测试");
    await receiver.getByRole("button", { name: "加入互传区" }).click();
    await receiver.getByText("文件群成员 2 / 5 人").click();
    await expect(receiver.locator(".room-members img")).toHaveJSProperty("naturalWidth", 160);

    await page.goto(origin + "/account");
    await edit.click();
    await dialog.getByRole("button", { name: "恢复默认头像" }).click();
    await dialog.getByRole("button", { name: "保存头像" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await guest.request.get(roomImage.href)).status()).toBe(404);
  } finally {
    await Promise.all([owner.close(), guest.close(), outsider.close()]);
    station.closeAllConnections();
    await new Promise<void>(resolve => station.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
