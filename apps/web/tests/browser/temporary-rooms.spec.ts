import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { decodeRoomInvitation } from "../room-test-qr.mjs";
import { createTestTls } from "../room-test-tls.mjs";
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
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tF1sAAAAASUVORK5CYII=", "base64");
    await hostPage.getByLabel("选择文件").setInputFiles({ name: "合成缩略图.png", mimeType: "image/png", buffer: png });
    const preview = hostPage.getByRole("img", { name: "所选文件的缩略图" });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await hostPage.getByText("手机扫码加入", { exact: true }).click();
    await expect(hostPage.getByText("请用手机可访问的 HTTPS 站点创建互传区。")).toBeVisible();
    await expect(hostPage.getByRole("img", { name: "互传区邀请二维码" })).toHaveCount(0);
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
    await expect(hostPage.getByText("文件群成员 1 / 5 人")).toBeVisible();
    await expect(hostPage.getByRole("heading", { name: "待批准访客" })).toBeVisible();
    await hostPage.getByRole("button", { name: "批准", exact: true }).click();
    await expect(guestPage.getByRole("heading", { name: "共享文件" })).toBeVisible();
    await expect(guestPage.getByText("文件群成员 2 / 5 人")).toBeVisible();
    await expect(guestPage.getByRole("heading", { name: "乙 成员" }).locator(".room-avatar")).toBeVisible();

    for (const [sender, recipient, name] of [
      [hostPage, guestPage, "甲到乙.txt"],
      [guestPage, hostPage, "乙到甲.txt"],
    ] as const) {
      const source = Buffer.from(`合成文件 ${name}`);
      await sender.getByLabel("选择文件").setInputFiles({ name, mimeType: "text/plain", buffer: source });
      await sender.getByRole("button", { name: "发给全区 2 人" }).click();
      const received = recipient.locator("article").filter({ hasText: name });
      await expect(received.getByText(sender === hostPage ? "发件人 甲" : "发件人 乙", { exact: true })).toBeVisible();
      await expect(sender.locator("article").filter({ hasText: name }).getByText("我发送的", { exact: true })).toBeVisible();
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
    guestPage.once("dialog", dialog => dialog.accept());
    await guestPage.getByRole("button", { name: "退出文件群" }).click();
    await expect(guestPage.getByText("你已退出文件群，可使用邀请重新加入。")).toBeVisible();
    await expect(hostPage.getByText("文件群成员 1 / 5 人")).toBeVisible();
    await guestPage.getByRole("button", { name: "加入互传区" }).click();
    await hostPage.getByRole("button", { name: "批准", exact: true }).click();
    await hostPage.getByText("文件群成员 2 / 5 人").click();
    hostPage.once("dialog", dialog => dialog.accept());
    await hostPage.getByRole("button", { name: "移出 乙" }).click();
    await expect(guestPage.getByText("你已被移出这个文件群。")).toBeVisible();
    await expect(hostPage.getByText("文件群成员 1 / 5 人")).toBeVisible();
  } finally {
    await Promise.all([owner.close(), guest.close()]);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("电脑显示的二维码可解出原邀请，手机视口使用同一地址申请并获批", async () => {
  const root = await mkdtemp(join(tmpdir(), "ningmao-browser-scan-"));
  const tls = await createTestTls(root, ["room.test"]);
  const server = createRoomServer(root, tls, 512 * 1024 * 1024).listen(0, "127.0.0.1");
  await once(server, "listening");
  let browser;
  try {
    browser = await chromium.launch({
      proxy: { server: "http://127.0.0.1:1", bypass: "room.test" },
      args: ["--host-resolver-rules=MAP room.test 127.0.0.1"],
    });
    const host = await browser.newPage({ ignoreHTTPSErrors: true });
    const phone = await browser.newPage({
      ignoreHTTPSErrors: true, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
    });
    await host.goto(`https://room.test:${server.address().port}/rooms`);
    await host.getByLabel("显示名称").fill("电脑房主");
    await host.getByLabel("入区需批准").check();
    await host.getByRole("button", { name: "创建互传区" }).click();
    const original = await host.getByLabel("邀请链接", { exact: true }).inputValue();
    await host.goto(original + "&test-marker=browser-only#local-view");
    const invitation = await decodeRoomInvitation(host);
    expect(invitation).toBe(original);
    await phone.goto(invitation);
    await phone.getByLabel("显示名称").fill("手机访客");
    await phone.getByRole("button", { name: "加入互传区" }).click();
    await expect(phone.getByText("等待群主或管理员批准加入。")).toBeVisible();
    await expect(phone.getByRole("heading", { name: "共享文件" })).toHaveCount(0);
    await host.getByRole("button", { name: "批准", exact: true }).click();
    await expect(phone.getByText("文件群成员 2 / 5 人")).toBeVisible();
    const mobileFile = "手机保存.txt";
    const bytes = Buffer.from("先校验，再保存的合成文件");
    await host.getByLabel("选择文件").setInputFiles({ name: mobileFile, mimeType: "text/plain", buffer: bytes });
    await host.getByRole("button", { name: "发给全区 2 人" }).click();
    await phone.getByRole("button", { name: `准备保存 ${mobileFile}`, exact: true }).click();
    await expect(phone.getByRole("status")).toHaveText("文件校验通过，请点击保存。");
    const download = phone.waitForEvent("download");
    await phone.getByRole("button", { name: `保存 ${mobileFile}`, exact: true }).click();
    const saved = await download;
    await expect(phone.getByRole("status")).toHaveText("校验通过，已交给浏览器保存。");
    expect(await readFile(await saved.path())).toEqual(bytes);
  } finally {
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
