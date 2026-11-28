import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createRoomServer } from "../../selfhost/server.mjs";

const MiB = 1024 * 1024;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("五人满员时双发四收、一端断线续传并校验全部落盘", async ({ browser }) => {
  test.setTimeout(75_000);
  const root = await mkdtemp(join(tmpdir(), "ningmao-five-member-"));
  const server = createRoomServer(join(root, "station"), undefined, 64 * MiB).listen(0, "127.0.0.1");
  await once(server, "listening");
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()));
  let releaseUploads!: () => void;
  let releaseReceipts!: () => void;
  const uploadsReady = new Promise<void>(resolve => { releaseUploads = resolve; });
  const receiptsReady = new Promise<void>(resolve => { releaseReceipts = resolve; });
  const rssBaseline = process.memoryUsage.rss();
  let rssPeak = rssBaseline;
  const memory = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage.rss()); }, 25);
  try {
    const [owner, ...guests] = await Promise.all(contexts.map(context => context.newPage()));
    await owner.goto(`http://127.0.0.1:${server.address().port}/rooms`);
    await owner.getByLabel("显示名称").fill("群主");
    await owner.getByLabel("入区需批准").check();
    await owner.getByRole("button", { name: "创建互传区" }).click();
    const invite = await owner.getByLabel("邀请链接", { exact: true }).inputValue();
    await Promise.all(guests.map(async (guest, index) => {
      await guest.goto(invite);
      await guest.getByLabel("显示名称").fill("成员 " + (index + 1));
      await guest.getByRole("button", { name: "加入互传区" }).click();
      await expect(guest.getByText("等待群主或管理员批准加入。")).toBeVisible();
    }));
    const approve = owner.getByRole("button", { name: "批准", exact: true });
    for (let i = 0; i < guests.length; i++) await approve.first().click();
    await Promise.all([owner, ...guests].map(page => expect(page.getByText("文件群成员 5 / 5 人")).toBeVisible()));

    const name = "同名样本.bin";
    const bytesA = Buffer.alloc(8 * MiB + 127, 71);
    const bytesB = Buffer.alloc(8 * MiB + 251, 16);
    const firstSender = guests[0];
    const fixtures = [bytesA, bytesB];
    const inputs = await Promise.all(fixtures.map(async (bytes, index) => {
      const folder = join(root, "sender-" + index);
      await mkdir(folder);
      const path = join(folder, name);
      await writeFile(path, bytes);
      return path;
    }));
    let starting = 0;
    await Promise.all([owner, firstSender].map(async (page, index) => {
      await page.route(/\/bulk\/[a-f0-9]{32}$/, async route => {
        if (route.request().headers()["x-offset"] === "0") {
          starting++;
          await uploadsReady;
        }
        await route.continue();
      });
      await page.getByLabel("选择文件").setInputFiles(inputs[index]);
      await page.evaluate(() => {
        document.addEventListener("submit", () => performance.mark("room-send-start"), { once: true, capture: true });
        const observer = new MutationObserver(() => {
          if (/校验来源|上传/.test(document.querySelector(".room-feedback[role=status]")?.textContent ?? "")) {
            performance.mark("room-first-progress");
            observer.disconnect();
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      });
    }));
    const uploadStart = performance.now();
    await Promise.all([owner, firstSender].map(page => page.getByRole("button", { name: "发给全区 5 人" }).click()));
    await expect.poll(() => starting).toBe(2);
    releaseUploads();
    await Promise.all([owner, firstSender].map(page => expect(page.getByRole("status")).toContainText("文件校验通过")));
    const uploadMs = performance.now() - uploadStart;
    const firstProgressMs = await Promise.all([owner, firstSender].map(page => page.evaluate(() =>
      performance.measure("room-first", "room-send-start", "room-first-progress").duration)));

    const fileRow = (page: typeof owner, author: string) => page.locator("article").filter({ hasText: author });
    const ownerFile = (page: typeof owner) => fileRow(page, "发件人 群主").getByRole("button", { name: "保存 " + name });
    let readers = 0;
    let failed = false;
    const recoveryRanges: string[] = [];
    await Promise.all(guests.map((page, index) => contexts[index + 1].route(/\/files\/[a-f0-9]{32}$/, async route => {
      const range = route.request().headers().range;
      if (index === 3) recoveryRanges.push(range);
      if (range.startsWith("bytes=0-")) {
        readers++;
        await receiptsReady;
      }
      if (index === 3 && !failed && range.startsWith("bytes=4194304-")) {
        failed = true;
        await route.abort();
      } else await route.continue();
    })));
    const downloadStart = performance.now();
    const normalDownloads = guests.slice(0, 3).map(page => page.waitForEvent("download", { timeout: 40_000 }));
    await Promise.all(guests.map(page => ownerFile(page).click()));
    await expect.poll(() => readers).toBe(4);
    releaseReceipts();
    await expect(guests[3].getByRole("alert")).toBeVisible();
    const resumedDownload = guests[3].waitForEvent("download");
    await ownerFile(guests[3]).click();
    const downloads = await Promise.all([...normalDownloads, resumedDownload]);
    const downloadMs = performance.now() - downloadStart;
    await Promise.all(downloads.map(async (download, index) => {
      expect(download.suggestedFilename()).toBe(name);
      const path = join(root, `receiver-${index}.bin`);
      await download.saveAs(path);
      expect(digest(await readFile(path))).toBe(digest(bytesA));
    }));
    expect(recoveryRanges).toEqual(["bytes=0-4194303", "bytes=4194304-8388607",
      "bytes=4194304-8388607", "bytes=8388608-8388734"]);

    const repeated = guests[3].waitForEvent("download");
    await ownerFile(guests[3]).click();
    await (await repeated).saveAs(join(root, "repeated.bin"));
    expect(recoveryRanges).toHaveLength(4);
    expect(digest(await readFile(join(root, "repeated.bin")))).toBe(digest(bytesA));

    const returnDownload = owner.waitForEvent("download");
    await fileRow(owner, "发件人 成员 1").getByRole("button", { name: "保存 " + name }).click();
    await (await returnDownload).saveAs(join(root, "returned.bin"));
    expect(digest(await readFile(join(root, "returned.bin")))).toBe(digest(bytesB));
    await expect(owner.locator("article").filter({ hasText: name })).toHaveCount(2);
    await Promise.all(inputs.map(async (path, index) =>
      expect(digest(await readFile(path))).toBe(digest(fixtures[index]))));
    const round = (value: number) => Math.round(value * 10) / 10;
    console.log("five-member-room " + JSON.stringify({
      firstProgressMs: firstProgressMs.map(round),
      uploadMiBps: round((bytesA.length + bytesB.length) / MiB / (uploadMs / 1000)),
      fanoutMiBps: round(4 * bytesA.length / MiB / (downloadMs / 1000)),
      stationAndRunnerBaselineMiB: round(rssBaseline / MiB),
      stationAndRunnerPeakMiB: round(rssPeak / MiB),
      receivers: downloads.length,
    }));
  } finally {
    releaseUploads();
    releaseReceipts();
    clearInterval(memory);
    await Promise.all(contexts.map(context => context.close()));
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
