import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createRoomServer } from "../../selfhost/server.mjs";

test("网页站点账号可独立注册、改名改密，退出后按新凭据登录", async ({ browser }) => {
  const data = await mkdtemp(join(tmpdir(), "ningmao-browser-account-"));
  const station = createRoomServer(data).listen(0, "127.0.0.1");
  await once(station, "listening");
  const address = (station.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${address}`;
  const primary = await browser.newContext({ viewport: { width: 340, height: 740 } });
  const secondary = await browser.newContext();
  const password = "Synthetic original passphrase";
  const updatedPassword = "Synthetic renewed passphrase";
  try {
    const page = await primary.newPage();
    const visitor = await secondary.newPage();
    const accountRoute = origin + "/api/account";
    await page.route(accountRoute, route => route.fulfill({ status: 503, json: "站点暂时无法连接。" }));
    const invite = "a".repeat(32);
    await page.goto(origin + "/rooms?code=" + invite);
    await page.getByRole("link", { name: "账号", exact: true }).click();
    await expect(page.getByRole("link", { name: "返回互传区" })).toHaveAttribute("href", "/rooms?code=" + invite);
    await expect(page.getByRole("alert")).toHaveText("站点暂时无法连接。");
    await expect(page.getByRole("button", { name: "登录账号" })).toHaveCount(0);
    await page.unroute(accountRoute);
    await page.getByRole("button", { name: "重新检查" }).click();
    await page.getByRole("button", { name: "注册新账号" }).click();
    await page.getByLabel("账号名", { exact: true }).fill("测试账号");
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByLabel("再输入一次密码", { exact: true }).fill("故意输错");
    await page.getByRole("button", { name: "创建账号" }).click();
    await expect(page.getByRole("alert")).toHaveText("两次输入的密码不一致。");
    await page.getByLabel("再输入一次密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "创建账号" }).click();
    const profile = page.getByRole("region", { name: "当前账号" });
    await expect(profile).toContainText("测试账号");
    await page.reload();
    await expect(profile).toContainText("测试账号");

    await visitor.goto(origin + "/account");
    await expect(visitor.getByRole("heading", { name: "站点账号" })).toBeVisible();
    await expect(visitor.getByRole("region", { name: "当前账号" })).toHaveCount(0);
    async function signInVisitor(username: string, secret: string) {
      await visitor.getByLabel("账号名", { exact: true }).fill(username);
      await visitor.getByLabel("密码", { exact: true }).fill(secret);
      await visitor.getByRole("button", { name: "登录", exact: true }).click();
      await expect(visitor.getByRole("region", { name: "当前账号" })).toContainText(username);
    }
    await signInVisitor("测试账号", password);
    const modifyName = page.getByRole("region", { name: "修改账号名" });
    await modifyName.getByLabel("新账号名").fill("测试新名");
    await modifyName.getByLabel("当前密码").fill("synthetic incorrect password");
    await modifyName.getByRole("button", { name: "保存账号名" }).click();
    await expect(page.getByRole("alert")).toHaveText("当前密码不正确。");
    await expect(profile).toContainText("测试账号");
    await modifyName.getByLabel("当前密码").fill(password);
    await modifyName.getByRole("button", { name: "保存账号名" }).click();
    await expect(profile).toContainText("测试新名");
    const modifyPassword = page.getByRole("region", { name: "修改密码" });
    await modifyPassword.getByLabel("当前密码", { exact: true }).fill(password);
    await modifyPassword.getByLabel("新密码", { exact: true }).fill(updatedPassword);
    await modifyPassword.getByLabel("再输入一次新密码", { exact: true }).fill(updatedPassword);
    await modifyPassword.getByRole("button", { name: "保存新密码" }).click();
    await expect(page.getByRole("status")).toHaveText("密码已更新，其他会话已退出。");
    const revoked = visitor.getByRole("region", { name: "修改账号名" });
    await revoked.getByLabel("当前密码").fill(password);
    await revoked.getByRole("button", { name: "保存账号名" }).click();
    await expect(visitor.getByRole("alert")).toHaveText("登录已失效，请重新登录。");
    await expect(visitor.getByRole("heading", { name: "站点账号" })).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).click();
    await signInVisitor("测试新名", updatedPassword);
    await expect(profile).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(340);
  } finally {
    await Promise.all([primary.close(), secondary.close()]);
    station.closeAllConnections();
    await new Promise<void>(resolve => station.close(() => resolve()));
    await rm(data, { recursive: true, force: true });
  }
});

test("桌面授权打开网页后自动登录，独立网页账号仍可自行建区", async ({ browser }) => {
  const data = await mkdtemp(join(tmpdir(), "ningmao-account-handoff-"));
  const station = createRoomServer(data).listen(0, "127.0.0.1");
  await once(station, "listening");
  const origin = `http://127.0.0.1:${(station.address() as { port: number }).port}`;
  const desktop = await browser.newContext();
  const clean = await browser.newContext();
  const independent = await browser.newContext();
  const password = "Synthetic handoff passphrase";
  const api = origin + "/api/account";
  try {
    for (const [context, username] of [[desktop, "桌面正式账号"], [independent, "独立网页账号"]] as const) {
      expect((await context.request.post(api + "/register", { data: { username, password } })).status()).toBe(201);
    }
    async function issue() {
      const response = await desktop.request.post(api + "/browser-link", { data: {} });
      expect(response.status()).toBe(200);
      return (await response.json()).code as string;
    }
    const code = await issue();
    const first = await clean.newPage();
    await first.goto(origin + "/account#open=" + code);
    await expect(first.getByText("桌面正式账号", { exact: true })).toBeVisible();
    expect((await (await clean.request.get(api)).json()).account).toBeNull();
    await first.getByRole("button", { name: "继续使用桌面账号" }).click();
    await expect(first).toHaveURL(origin + "/rooms");
    await expect(first.getByText("使用账号 桌面正式账号")).toBeVisible();
    await first.goto(origin + "/account#open=" + await issue());
    await expect(first).toHaveURL(origin + "/rooms");
    await expect(first.getByText("使用账号 桌面正式账号")).toBeVisible();
    expect((await clean.request.post(api + "/browser-login", { data: { code } })).status()).toBe(401);

    const second = await independent.newPage();
    await second.goto(origin + "/account#open=" + await issue());
    await expect(second.getByRole("alert")).toContainText("浏览器已登录其他账号");
    expect(new URL(second.url()).hash).toBe("");
    await second.goto(origin);
    await expect(second.getByText("使用账号 独立网页账号")).toBeVisible();
    await second.getByRole("button", { name: "创建互传区" }).click();
    await expect(second.getByRole("heading", { name: "共享文件" })).toBeVisible();
    expect(new URL(second.url()).searchParams.get("code")).toMatch(/^[a-f0-9]{32}$/);
    expect((await (await desktop.request.get(api)).json()).account.username).toBe("桌面正式账号");

    const revoked = await issue();
    expect((await desktop.request.post(api + "/logout", { data: {} })).status()).toBe(200);
    expect((await clean.request.post(api + "/browser-login", { data: { code: revoked } })).status()).toBe(401);
  } finally {
    await Promise.all([desktop.close(), clean.close(), independent.close()]);
    station.closeAllConnections();
    await new Promise<void>(resolve => station.close(() => resolve()));
    await rm(data, { recursive: true, force: true });
  }
});
