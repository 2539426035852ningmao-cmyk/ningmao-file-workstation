import { expect, test } from "@playwright/test";

test("临时互传区使用已选文件和显式保存目录，刷新后旧收件不会再写入", async ({ page }) => {
  await page.addInitScript(() => {
    const source = { id: 1, name: "selected.txt", shelf_id: 1, path: "SYNTHETIC/selected.txt", kind: "txt", bytes: 2, modified: 1, status: "normal", tags: [] };
    localStorage.setItem("test-state", JSON.stringify({
      shelves: [
        { id: 1, name: "灵感收集", kind: "persistent", root: null, available: true },
        { id: 3, name: "合成接收", kind: "bound", root: "SYNTHETIC/receive", available: true },
      ], items: [source], jobs: [],
    }));
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {
      transformCallback: () => 42,
      invoke: async (command: string, args: Record<string, unknown>) => {
        const calls = JSON.parse(sessionStorage.getItem("room-test-calls") || "[]");
        calls.push({ command, args });
        sessionStorage.setItem("room-test-calls", JSON.stringify(calls));
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([65, 66]))))
          .map(byte => byte.toString(16).padStart(2, "0")).join("");
        if (command === "room_join") return { member: { name: "合成装机端" } };
        if (command === "room_view") return { member: { name: "合成装机端" }, bulk: true, files: [{ id: "a".repeat(32), name: "received.txt", size: 2, digest }, { id: "c".repeat(32), name: "large.bin", size: 80_000_000, digest, chunked: 1 }] };
        if (command === "web_transfer_prepare") return { ticket: args.ticket, bytes: 2, name: "selected.txt", sha256: digest };
        if (command === "room_bulk_receive") return {};
        if (command === "room_download") return new Uint8Array([65, 66]).buffer;
        if (command === "web_receive_prepare") {
          if (calls.filter((call: { command: string }) => call.command === command).length === 1) {
            throw "已拒绝接收，未创建本机文件";
          }
          return { ticket: args.ticket, job_id: 1, bytes: 2 };
        }
        if (command === "web_receive_append") return { received: 2, total: 2 };
        if (command === "web_receive_finish") return { job_id: 1, bytes: 2, status: "completed", file_name: "received (1).txt" };
      },
    }});
  });
  await page.goto("/tests/harness.html?temporary-room");
  await page.getByRole("button", { name: "选择 selected.txt", exact: true }).click();
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "发送到设备", exact: true }).click();
  await page.getByText("临时互传区", { exact: true }).click();
  await page.getByLabel("邀请链接").fill("https://example.test/rooms?code=" + "b".repeat(32));
  await page.getByLabel("显示名称").fill("合成装机端");
  await page.getByRole("button", { name: "加入互传区" }).click();
  await page.getByRole("button", { name: "将所选文件发给全区" }).click();
  await expect(page.getByRole("button", { name: "保存 received.txt", exact: true })).toBeDisabled();
  await page.getByLabel("保存到", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "保存 received.txt", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("已拒绝接收");
  await page.getByRole("button", { name: "保存 received.txt", exact: true }).click();
  await expect(page.getByText("received (1).txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "刷新互传区" }).click();
  await expect(page.getByText("received (1).txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存 large.bin", exact: true }).click();
  await expect(page.getByText("received (1).txt", { exact: true })).toHaveCount(2);
  const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("room-test-calls") || "[]"));
  expect(calls.filter((call: { command: string }) => call.command === "room_download")).toHaveLength(2);
  expect(calls.filter((call: { command: string }) => call.command === "web_receive_finish")).toHaveLength(2);
  expect(calls.filter((call: { command: string }) => call.command === "room_bulk_receive")).toHaveLength(1);
  expect(calls.find((call: { command: string }) => call.command === "web_receive_prepare").args.shelfId).toBe(3);
  expect(calls.find((call: { command: string }) => call.command === "room_bulk_upload").args.itemId).toBe(1);
});
