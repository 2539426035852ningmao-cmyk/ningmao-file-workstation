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
    const picker = hostPage.getByLabel("选择文件");
    const send = hostPage.getByRole("button", { name: "发给全区 2 人" });
    // Exercise the size boundaries before upload without allocating large fixtures.
    for (const [size, hint] of [
      [9_999_999_999, "发布后可领取 24 小时"],
      [10_000_000_000, "发布后可领取 6 小时"],
      [20_000_000_000, "发布后可领取 6 小时"],
      [20_000_000_001, "超过单文件上限，请重新选择。"],
    ] as const) {
      await picker.evaluate((input: HTMLInputElement, bytes) => {
        const file = new File(["x"], "合成边界样本.bin");
        Object.defineProperty(file, "size", { value: bytes });
        const selection = new DataTransfer();
        selection.items.add(file);
        input.files = selection.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, size);
      await expect(hostPage.getByText(hint, { exact: false })).toBeVisible();
      await expect(send).toBeEnabled({ enabled: size <= 20_000_000_000 });
    }
    const offsets: number[] = [];
    let interrupted = false;
    await hostPage.route(/\/bulk\/[a-f0-9]{32}$/, async route => {
      const offset = Number(route.request().headers()["x-offset"]);
      offsets.push(offset);
      if (!interrupted && offset > 0) { interrupted = true; await route.abort(); }
      else await route.continue();
    });
    await hostPage.getByLabel("选择文件").setInputFiles({ name: "分块.txt", mimeType: "text/plain", buffer: source });
    await send.click();
    await expect(hostPage.getByRole("alert")).toBeVisible();
    await expect(guestPage.getByRole("button", { name: "保存 分块.txt" })).toHaveCount(0);
    await hostPage.getByRole("button", { name: "续传原文件" }).click();
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
    const download = guestPage.waitForEvent("download");
    await save.click();
    const path = join(root, "received.txt");
    await (await download).saveAs(path);
    await expect(guestPage.getByRole("status")).toHaveText("校验通过，已交给浏览器保存。");
    expect(ranges).toEqual(["bytes=0-4194303", "bytes=4194304-4194423", "bytes=4194304-4194423"]);
    const saved = await readFile(path);
    expect(saved.length).toBe(source.length);
    expect(createHash("sha256").update(saved).digest("hex")).toBe(createHash("sha256").update(source).digest("hex"));
  } finally {
    await Promise.all([owner.close(), guest.close()]);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("已完成的成员接手供件，两个来源离线后由站点从同一偏移接续", async ({ browser }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "ningmao-peer-room-"));
  const server = createRoomServer(root, undefined, 32 * 1024 * 1024).listen(0, "127.0.0.1");
  await once(server, "listening");
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const [host, seed, receiver] = await Promise.all(contexts.map(context => context.newPage()));
    await host.goto(`http://127.0.0.1:${server.address().port}`);
    await host.getByLabel("显示名称").fill("原发件端");
    await host.getByRole("button", { name: "创建互传区" }).click();
    const invite = await host.getByLabel("邀请链接").inputValue();
    for (const [page, name] of [[seed, "完成的成员"], [receiver, "下载者"]] as const) {
      await page.goto(invite);
      await page.getByLabel("显示名称").fill(name);
      await page.getByRole("button", { name: "加入互传区" }).click();
    }

    const fixture = Buffer.concat([
      Buffer.alloc(4 * 1024 * 1024, 71), Buffer.alloc(4 * 1024 * 1024, 12), Buffer.alloc(120, 98),
    ]);
    const file = "switch.txt";
    const source = (page: typeof host, label: string) => page.getByRole("button", { name: label + " " + file });
    await host.getByLabel("选择文件").setInputFiles({ name: file, mimeType: "text/plain", buffer: fixture });
    await host.getByRole("button", { name: "发给全区 3 人" }).click();
    await expect(host.getByRole("status")).toContainText("文件校验通过");
    const seedDownload = seed.waitForEvent("download");
    await source(seed, "保存").click();
    await seedDownload;
    await source(host, "开始供件").click();
    await expect(source(host, "停止供件")).toBeVisible();
    await source(seed, "开始供件").click();
    await expect(source(seed, "停止供件")).toBeVisible();

    const originRanges: string[] = [];
    await contexts[2].route(/\/files\/[a-f0-9]{32}$/, async route => {
      originRanges.push(route.request().headers().range);
      await route.continue();
    });
    const online: string[][] = [];
    await contexts[2].route(/\/sources\/[a-f0-9]{32}\?/, async route => {
      const offset = new URL(route.request().url()).searchParams.get("offset");
      if (offset === "4194304") await source(host, "停止供件").click();
      if (offset === "8388608") await source(seed, "停止供件").click();
      const result = await route.fetch();
      const details = await result.json();
      online.push(details.sources);
      await route.fulfill({ response: result, json: details });
    });
    const save = source(receiver, "保存");
    const download = receiver.waitForEvent("download", { timeout: 40_000 });
    await save.click();
    const path = join(root, "switched.txt");
    await (await download).saveAs(path);
    expect(online.map(peers => peers.length)).toEqual([2, 1, 0]);
    expect(online[1][0]).toBe(online[0][1]);
    expect(originRanges).toEqual(["bytes=8388608-8388727"]);
    expect(createHash("sha256").update(await readFile(path)).digest("hex")).toBe(createHash("sha256").update(fixture).digest("hex"));
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
