import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createRoomServer } from "../../selfhost/server.mjs";

test("网页上传中断后从已确认偏移续传，接收端校验后实际保存", async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), "ningmao-room-chunks-"));
  const server = createRoomServer(root, undefined, 32 * 1024 * 1024).listen(0, "127.0.0.1");
  await once(server, "listening");
  const owner = await browser.newContext();
  const guest = await browser.newContext();
  try {
    const source = Buffer.alloc(4 * 1024 * 1024 + 120, 43);
    const hostPage = await owner.newPage();
    const guestPage = await guest.newPage();
    await hostPage.goto(`http://127.0.0.1:${server.address().port}`);
    await hostPage.getByLabel("显示名称").fill("甲");
    await hostPage.getByRole("button", { name: "创建互传区" }).click();
    await guestPage.goto(await hostPage.getByLabel("邀请链接").inputValue());
    await guestPage.getByLabel("显示名称").fill("乙");
    await guestPage.getByRole("button", { name: "加入互传区" }).click();
    const offsets: number[] = [];
    let interrupted = false;
    await hostPage.route(/\/bulk\/[a-f0-9]{32}$/, async route => {
      const offset = Number(route.request().headers()["x-offset"]);
      offsets.push(offset);
      if (!interrupted && offset > 0) { interrupted = true; await route.abort(); }
      else await route.continue();
    });
    await hostPage.getByLabel("选择文件").setInputFiles({ name: "分块.txt", mimeType: "text/plain", buffer: source });
    const send = hostPage.getByRole("button", { name: "发给全区 2 人" });
    await send.click();
    await expect(hostPage.getByRole("alert")).toBeVisible();
    await expect(guestPage.getByRole("button", { name: "保存 分块.txt" })).toHaveCount(0);
    await send.click();
    await expect(hostPage.getByRole("status")).toContainText("文件校验通过");
    expect(offsets).toEqual([0, 4 * 1024 * 1024, 4 * 1024 * 1024]);
    const ranges: string[] = [];
    let interruptedDownload = false;
    await guest.route(/\/files\/[a-f0-9]{32}$/, async route => {
      const range = route.request().headers().range;
      ranges.push(range);
      if (!interruptedDownload && range.startsWith("bytes=4194304-")) {
        interruptedDownload = true;
        await route.abort();
      } else await route.continue();
    });
    const save = guestPage.getByRole("button", { name: "保存 分块.txt" });
    await save.click();
    await expect(guestPage.getByRole("alert")).toBeVisible();
    await save.click();
    await expect(guestPage.getByRole("status")).toHaveText("文件校验通过，请点击保存。");
    expect(ranges).toEqual(["bytes=0-4194303", "bytes=4194304-4194423", "bytes=4194304-4194423"]);
    const download = guestPage.waitForEvent("download");
    await save.click();
    const path = join(root, "received.txt");
    await (await download).saveAs(path);
    const saved = await readFile(path);
    expect(saved.length).toBe(source.length);
    expect(createHash("sha256").update(saved).digest("hex")).toBe(createHash("sha256").update(source).digest("hex"));
  } finally {
    await Promise.all([owner.close(), guest.close()]);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
