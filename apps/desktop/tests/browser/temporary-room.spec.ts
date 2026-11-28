import { expect, test } from "@playwright/test";

test("本机站点需显式启停，启动后将地址填入建区入口", async ({ page }) => {
  await page.addInitScript(() => {
    const address = "http://127.0.0.1:5192/rooms";
    const host = { available: true, running: false, folder: null as string | null, quota_mib: 512, address: null as string | null };
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {
      transformCallback: () => 42,
      invoke: async (command: string, args: Record<string, unknown>) => {
        if (command === "station_account_view") return { username: null, station: null, can_associate: true };
        if (command === "station_account_login") {
          if (args.register === true) {
            if (args.username !== "合成新账号" || args.associate !== false || args.station !== address) throw new Error("意外创建参数");
            throw new Error("合成账号已被使用");
          }
          if (args.username !== "合成账号" || args.associate !== true || args.station !== address) throw new Error("意外账号参数");
          throw new Error("合成站点要求重试");
        }
        if (command === "room_station_view") return { ...host };
        if (command === "room_station_choose") host.folder = "SYNTHETIC/柠猫互传暂存";
        else if (command === "room_station_start") {
          if (!host.folder || args.quotaMib !== 2048) throw new Error("意外的启动参数");
          Object.assign(host, { address, running: true, quota_mib: args.quotaMib });
        } else if (command === "room_station_stop") {
          Object.assign(host, { address: null, running: false });
        } else return;
        return { ...host };
      },
    }});
  });
  await page.goto("/tests/harness.html?temporary-room");
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "账户", exact: true }).click();
  await expect(page.getByRole("button", { name: "创建账号", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "设置本机站点", exact: true }).click();
  await expect(page.getByText("已停止", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "启动站点" })).toBeDisabled();
  await page.getByRole("button", { name: "选择暂存位置" }).click();
  await expect(page.getByLabel("暂存位置", { exact: true })).toHaveValue("SYNTHETIC/柠猫互传暂存");
  const quota = page.getByRole("combobox", { name: "文件暂存配额", exact: true });
  await quota.selectOption("2048");
  await page.getByRole("button", { name: "启动站点" }).click();
  await expect(page.getByLabel("互传站点地址", { exact: true })).toHaveValue("http://127.0.0.1:5192/rooms");
  await expect(page.getByLabel("账号站点")).toHaveValue("http://127.0.0.1:5192/rooms");
  await expect(page.getByLabel("本机工作区")).toHaveValue("separate");
  await page.getByLabel("本机工作区").selectOption("associate");
  await page.getByLabel("账号名", { exact: true }).fill("合成账号");
  await page.getByLabel("密码", { exact: true }).fill("synthetic credentials only");
  await page.getByRole("button", { name: "登录并切换工作区" }).click();
  await expect(page.getByRole("alert")).toHaveText("Error: 合成站点要求重试");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.getByLabel("账号名", { exact: true }).fill("合成新账号");
  await page.getByLabel("密码", { exact: true }).fill("synthetic credentials only");
  await page.getByLabel("再输入一次密码").fill("mismatch");
  await page.getByRole("button", { name: "创建并登录" }).click();
  await expect(page.getByRole("alert")).toHaveText("两次输入的密码不一致。");
  await page.getByLabel("再输入一次密码").fill("synthetic credentials only");
  await page.getByRole("button", { name: "创建并登录" }).click();
  await expect(page.getByRole("alert")).toHaveText("Error: 合成账号已被使用");
  await page.getByRole("button", { name: "以游客继续" }).click();
  await expect(page.getByLabel("显示名称")).toHaveValue(/^游客-[A-F0-9]{4}$/);
  await expect(page.getByRole("button", { name: "停止站点" })).toBeHidden();
  await page.getByText("本机互传站点", { exact: false }).click();
  await expect(quota).toBeDisabled();
  await expect(page.getByLabel("入区需批准")).toBeChecked();
  await page.getByRole("button", { name: "停止站点" }).click();
  await expect(page.getByLabel("本机访问地址", { exact: true })).toHaveCount(0);
  await expect(quota).toHaveValue("2048");
});

test("临时互传区直达建区、接续文件架与显式保存", async ({ page }, testInfo) => {
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
        if (command === "room_create") return { invitation: "https://example.test/rooms?code=" + "d".repeat(32), recovery: "e".repeat(48) };
        if (command === "room_decide") return {};
        if (command === "room_view" && String(args.invitation).endsWith("d".repeat(32))) {
          return {
            member: { id: "e".repeat(24), name: "合成装机端", role: "owner" }, memberLimit: 5, bulk: true,
            files: sessionStorage.getItem("room-new-file") === "yes"
              ? [{ id: "g".repeat(32), name: "new.txt", size: 2, digest }] : [],
            members: [
              { id: "e".repeat(24), name: "合成装机端", status: "active", role: "owner" },
              ...(!calls.some((call: { command: string }) => call.command === "room_depart")
                ? [{ id: "f".repeat(24), name: "网页访客", role: "member", status:
                    calls.some((call: { command: string }) => call.command === "room_decide") ? "active" : "pending" }]
                : []),
            ],
          };
        }
        if (command === "room_view") {
          if (sessionStorage.getItem("room-offline") === "yes") throw "合成断线";
          if (sessionStorage.getItem("room-approved") !== "yes") return { status: "pending" };
          return {
            member: { id: "e".repeat(24), name: "合成装机端" }, bulk: true, directed: true,
            members: [{ id: "f".repeat(24), name: "网页访客", status: "active" }],
            files: [
              { id: "a".repeat(32), name: "received.txt", sender: "f".repeat(24), size: 2, digest },
              { id: "c".repeat(32), name: "large.bin", sender: "a".repeat(24), size: 80_000_000, digest, chunked: 1 },
              { id: "d".repeat(32), name: "sent.txt", sender: "e".repeat(24), size: 2, digest },
            ],
          };
        }
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
  const openRoom = async () => {
    await page.getByRole("button", { name: "更多操作", exact: true }).click();
    await page.getByRole("menuitem", { name: "临时互传区", exact: true }).click();
    await expect(page.getByRole("tab", { name: "临时互传区" })).toHaveAttribute("aria-selected", "true");
  };
  await openRoom();
  await expect(page.getByLabel("互传站点地址")).toHaveCount(0);
  await page.getByRole("textbox", { name: "邀请链接", exact: true }).fill("https://example.test/rooms?code=" + "b".repeat(32));
  await page.getByLabel("显示名称").fill("合成装机端");
  await page.getByRole("button", { name: "加入互传区", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "获批后会自动进入" })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入互传区", exact: true })).toBeDisabled();
  await page.evaluate(() => sessionStorage.setItem("room-approved", "yes"));
  await expect(page.getByRole("button", { name: "返回文件架选文件" })).toBeVisible();
  await page.getByRole("button", { name: "返回文件架选文件" }).click();
  await page.getByRole("button", { name: "选择 selected.txt", exact: true }).click();
  await openRoom();
  const card = page.getByRole("group", { name: "所选文件" });
  await expect(card.getByText("selected.txt", { exact: true })).toBeVisible();
  await expect(card.getByText("2 B", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "发送范围" }).selectOption("selected");
  await expect(page.getByRole("button", { name: "发送给 0 人" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "网页访客" }).check();
  await page.getByRole("button", { name: "发送给 1 人" }).click();
  await page.getByRole("combobox", { name: "发送范围" }).selectOption("all");
  await expect(page.getByText("发件人 网页访客", { exact: true })).toBeVisible();
  await expect(page.getByText("发件人已离群", { exact: true })).toBeVisible();
  await page.getByLabel("收发筛选").selectOption("sent");
  await expect(page.getByRole("button", { name: "保存 sent.txt", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存 received.txt", exact: true })).toHaveCount(0);
  await page.getByLabel("按文件名查找").fill(" RECEIVED.TXT ");
  await expect(page.getByText("未找到符合条件的文件。")).toBeVisible();
  await page.getByLabel("收发筛选").selectOption("received");
  await expect(page.getByRole("button", { name: "保存 received.txt", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存 large.bin", exact: true })).toHaveCount(0);
  await page.getByLabel("按文件名查找").clear();
  await page.getByLabel("收发筛选").selectOption("all");
  await expect(page.getByRole("button", { name: "保存 received.txt", exact: true })).toBeDisabled();
  await expect(page.getByText("选择保存位置后即可确认收件。")).toBeVisible();
  await page.getByLabel("保存到", { exact: true }).selectOption("3");
  await expect(page.getByText("选择保存位置后即可确认收件。")).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("room-offline", "yes"));
  await page.getByRole("button", { name: "刷新互传区" }).click();
  await expect(page.getByText("站点暂时无法连接，恢复后自动更新。")).toBeVisible();
  await expect(page.getByRole("button", { name: "将所选文件发给全区" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存 received.txt", exact: true })).toBeDisabled();
  await page.evaluate(() => sessionStorage.removeItem("room-offline"));
  await page.getByRole("button", { name: "刷新互传区" }).click();
  await expect(page.getByRole("button", { name: "保存 received.txt", exact: true })).toBeEnabled();
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
  const directed = calls.find((call: { command: string }) => call.command === "room_bulk_upload");
  expect(directed.args.itemId).toBe(1);
  expect(directed.args.recipients).toEqual(["f".repeat(24)]);

  await page.getByRole("button", { name: "切换互传区" }).click();
  await page.getByRole("button", { name: "发起新区", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "邀请链接", exact: true })).toHaveCount(0);
  await page.getByLabel("互传站点地址").fill("https://example.test");
  await expect(page.getByLabel("入区需批准")).toBeChecked();
  await page.getByRole("button", { name: "创建互传区", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "邀请链接", exact: true })).toHaveValue("https://example.test/rooms?code=" + "d".repeat(32));
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async (link: string) => sessionStorage.setItem("copied-invitation", link),
    });
  });
  await page.getByText("手机扫码加入", { exact: true }).click();
  await expect(page.getByRole("img", { name: "互传区邀请二维码" })).toBeVisible();
  await page.getByRole("button", { name: "复制邀请链接" }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("copied-invitation")))
    .toBe("https://example.test/rooms?code=" + "d".repeat(32));
  await expect(page.getByText("文件群成员 1 / 5 人")).toBeVisible();
  await page.getByRole("button", { name: "批准 网页访客" }).click();
  await page.getByText("文件群成员 2 / 5 人").click();
  await page.getByRole("button", { name: "移出 网页访客" }).click();
  await page.getByRole("group", { name: "确认成员变更" }).getByRole("button", { name: "取消" }).click();
  await expect(page.getByText("文件群成员 2 / 5 人")).toBeVisible();
  await page.getByRole("button", { name: "移出 网页访客" }).click();
  await page.getByRole("button", { name: "确认移出" }).click();
  await expect(page.getByText("文件群成员 1 / 5 人")).toBeVisible();
  const ownerCalls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("room-test-calls") || "[]"));
  expect(ownerCalls.find((call: { command: string }) => call.command === "room_create").args)
    .toEqual({ station: "https://example.test", name: "合成装机端", approval: true });
  expect(ownerCalls.find((call: { command: string }) => call.command === "room_decide").args)
    .toEqual({ invitation: "https://example.test/rooms?code=" + "d".repeat(32), memberId: "f".repeat(24), accept: true });
  expect(ownerCalls.filter((call: { command: string }) => call.command === "room_depart"))
    .toEqual([{ command: "room_depart", args: { invitation: "https://example.test/rooms?code=" + "d".repeat(32), memberId: "f".repeat(24) } }]);

  await page.getByRole("button", { name: "关闭文件互传" }).click();
  await openRoom();
  await expect(page.getByRole("textbox", { name: "邀请链接", exact: true })).toHaveValue("https://example.test/rooms?code=" + "d".repeat(32));
  await expect(page.getByLabel("保存到", { exact: true })).toHaveValue("3");
  await expect(page.getByRole("button", { name: "将所选文件发给全区" })).toBeEnabled();
  await page.evaluate(() => sessionStorage.setItem("room-new-file", "yes"));
  await expect(page.getByRole("button", { name: "保存 new.txt", exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 340, height: 440 });
  const panel = page.getByRole("tabpanel");
  const fitsViewport = () => panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
  expect(await fitsViewport()).toBe(true);
  await page.getByRole("button", { name: "切换互传区" }).click();
  await page.getByRole("textbox", { name: "邀请链接", exact: true }).fill("https://example.test/rooms?code=" + "a".repeat(32));
  await page.getByRole("button", { name: "返回当前互传区" }).click();
  await expect(page.getByRole("textbox", { name: "邀请链接", exact: true })).toHaveValue("https://example.test/rooms?code=" + "d".repeat(32));
  await page.getByRole("button", { name: "切换互传区" }).click();
  await page.getByRole("button", { name: "发起新区", exact: true }).click();
  expect(await fitsViewport()).toBe(true);
  if (process.env.NINGMAO_ROOM_QA) await page.screenshot({ path: testInfo.outputPath("room-create.png"), animations: "disabled" });
  await page.getByRole("button", { name: "返回当前互传区" }).click();
  if (process.env.NINGMAO_ROOM_QA) await page.screenshot({ path: testInfo.outputPath("room-connected.png"), animations: "disabled" });
});
