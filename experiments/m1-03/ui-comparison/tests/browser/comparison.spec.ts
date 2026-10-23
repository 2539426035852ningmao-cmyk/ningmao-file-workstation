import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

for (const system of ["spaceui", "shadcn"]) {
  test(`${system}: 查找、详情、预览、标签、菜单与 pointer 排序`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`/?variant=${system}`);
    await expect(page.locator('[data-asset-id="asset-0001"]')).toBeVisible();
    await page.getByRole("textbox", { name: "搜索素材" }).fill("没有这个样本");
    await expect(page.getByText("没有匹配的素材", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "清除筛选" }).click();
    await page.locator('[data-asset-id="asset-0001"]').getByRole("button").last().click();
    await page.getByRole("button", { name: "详情", exact: true }).click();
    await expect(page.locator(".inspector")).toBeVisible();
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "预览", exact: true })).toBeFocused();
    await page.locator('[data-asset-id="asset-0001"]').click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "切换精选标签" })).toBeVisible();
    await page.getByRole("menuitem", { name: "切换精选标签" }).click();
    const handle = page.getByRole("button", { name: "拖动 春日企划_封面_001.png", exact: true });
    const start = await handle.boundingBox();
    const target = await page.locator('[data-asset-id="asset-0003"]').boundingBox();
    if (!start || !target) throw new Error("排序目标未呈现");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + 25, start.y + 25, { steps: 6 });
    await expect(page.getByTestId("drag-preview")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${system}-drag-intermediate.png`) });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 14 });
    await page.mouse.up();
    await expect(page.getByTestId("first-order")).toContainText("asset-0002,asset-0003,asset-0001");
    await expect(page.getByTestId("interaction-counts")).toContainText("排序 1");
    await expect(page.getByTestId("drag-preview")).toHaveCount(0);
    await page.getByRole("button", { name: "详细列表", exact: true }).click();
    await expect(page.locator(".asset-row").first()).toBeVisible();
    await page.setViewportSize({ width: 640, height: 720 });
    await page.locator("[data-asset-id]").first().getByRole("button").last().click();
    await page.getByRole("button", { name: "详情", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`${system}-narrow-detail.png`) });
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar")).not.toBeVisible();
    await page.getByRole("button", { name: "展开导航", exact: true }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await page.getByRole("button", { name: "收起导航", exact: true }).click();
    await expect(page.locator(".sidebar")).not.toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`${system}: 两主题视觉和 500/2000 项滚动记录`, async ({ page }, testInfo) => {
    const reports: unknown[] = [];
    for (const theme of ["dark", "light"]) {
      await page.goto(`/?variant=${system}&theme=${theme}`);
      await expect(page.locator('[data-asset-id="asset-0001"]')).toBeVisible();
      await expect.poll(() => page.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete))).toBe(true);
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`${system}-${theme}-grid.png`) });
    }
    for (const count of [500, 2000]) for (const view of ["grid", "list"]) {
      await page.goto(`/?variant=${system}&count=${count}&view=${view}&theme=dark`);
      await expect(page.locator("[data-asset-id]").first()).toBeVisible();
      await page.getByText("M1-03 测试设置", { exact: false }).first().click();
      await page.getByRole("button", { name: "运行滚动采样", exact: true }).click();
      await expect(page.getByTestId("metrics")).toContainText('"p95FrameMs"', { timeout: 20_000 });
      const report = JSON.parse((await page.getByTestId("metrics").textContent())!);
      expect(report.count).toBe(count);
      expect(report.maxMounted).toBeLessThan(160);
      expect(report.samples).toBe(88);
      reports.push(report);
      await page.screenshot({ path: testInfo.outputPath(`${system}-${count}-${view}-sample.png`) });
    }
    const folder = resolve(process.env.M103_METRICS_DIR || testInfo.outputDir);
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, `${system}-browser-metrics.json`), JSON.stringify(reports, null, 2));
  });
}
