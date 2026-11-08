import {expect, test} from "@playwright/test";

test("W3 本机受控文件源可组装 W2 WebRTC 文件清单并释放 ticket", async ({page}) => {
  await page.goto("/tests/harness.html");
  const result = await page.evaluate(() => window.verifyDesktopWebSource("valid"));
  expect(result.error).toBeNull();
  expect(result.content).toBe("合成 W3 文件源 · Ningmao bridge");
  expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(result.calls).toEqual([
    "web_transfer_prepare", "web_transfer_read_chunk", "web_transfer_release"
  ]);
});
test("W3 本机源哈希失败不会返回文件且仍释放授权", async ({page}) => {
  await page.goto("/tests/harness.html");
  const result = await page.evaluate(() => window.verifyDesktopWebSource("bad-hash"));
  expect(result.content).toBeNull();
  expect(result.error).toContain("哈希校验失败");
  expect(result.calls.at(-1)).toBe("web_transfer_release");
});
test("W3 分块元数据不一致时中止发送并释放授权", async ({page}) => {
  await page.goto("/tests/harness.html");
  const result = await page.evaluate(() => window.verifyDesktopWebSource("bad-chunk"));
  expect(result.content).toBeNull();
  expect(result.error).toContain("异常文件分块");
  expect(result.calls.at(-1)).toBe("web_transfer_release");
});
