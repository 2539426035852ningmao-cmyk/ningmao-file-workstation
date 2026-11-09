#!/usr/bin/env node
import { readFileSync } from "node:fs";

const mode = process.argv[2] || "--source";
if (!["--source", "--deploy", "--live"].includes(mode)) {
  console.error("Usage: node scripts/preflight.mjs --source|--deploy|--live");
  process.exit(2);
}
function fail(message) { console.error("FAIL:", message); process.exitCode = 1; }
const raw = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
let config;
try { config = JSON.parse(raw); } catch { fail("Wrangler 配置不是有效 JSONC 子集"); process.exit(1); }
const bindings = config.durable_objects?.bindings || [];
if (!bindings.some(b => b.name === "ROOMS" && b.class_name === "DeviceRoom")) fail("缺少账号隔离的 ROOMs 绑定");
if (!config.migrations?.some(m => m.new_sqlite_classes?.includes("DeviceRoom"))) fail("应使用 SQLite Durable Objects");
if (config.assets?.run_worker_first?.includes("/api/*") !== true) fail("API 需要 Worker 优先处理");
if (!config.assets?.directory) fail("缺少静态网页构建产物路径");
if (!bindings.some(b => b.name === "REGISTRY" && b.class_name === "DeviceRegistry"))
  fail("W1 Windows 授权必须具有独立的可撤销设备登记对象");
if (!config.migrations?.some(m => m.new_sqlite_classes?.includes("DeviceRegistry")))
  fail("W1 Registry 必须启用 SQLite Durable Object 迁移");
if (!config.assets?.run_worker_first?.includes("/device-link/*"))
  fail("Windows 设备授权窄路径必须由 Worker 处理，不能回退到静态页面");
if (config.vars?.CF_ACCESS_TEAM_DOMAIN?.startsWith("CONFIGURE_") && mode === "--source") {
  console.log("SOURCE: Access 环境仍为占位；未授权部署时这是预期行为");
}
if (mode === "--deploy" && process.env.NINGMAO_W4_DEPLOY_APPROVED !== "YES") {
  fail("缺少明确的公网部署审批：设置 NINGMAO_W4_DEPLOY_APPROVED=YES 前需确认 Access 策略、测试域名、额度和回滚方案");
}
if (mode === "--deploy" || mode === "--live") {
  const domain = config.vars?.CF_ACCESS_TEAM_DOMAIN || "";
  const aud = config.vars?.CF_ACCESS_AUD || "";
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain) || domain.startsWith("CONFIGURE_"))
    fail("先配置真实 Cloudflare Access Team Domain");
  if (aud.startsWith("CONFIGURE_") || !/^[A-Za-z0-9_-]{16,128}$/.test(aud))
    fail("先配置真实 Access 应用 Audience");
}
if (mode === "--live") {
  const target = process.env.NINGMAO_WEB_URL || "";
  if (!/^https:\/\/[^/]+$/i.test(target)) fail("NINGMAO_WEB_URL 必须是已批准的 HTTPS 域名（不含路径）");
  if (!process.exitCode) {
    try {
      const [root, api] = await Promise.all(["/", "/api/me"].map(path =>
        fetch(target + path, { redirect: "manual", headers: { "User-Agent": "Ningmao-preflight/1" } })
      ));
      if (root.ok) fail("公开未登录访问网页成功：Access 必须覆盖整个站点");
      if (api.ok) fail("未登录请求泄露私有身份：必须阻止");
      console.log("LIVE: 未登录网页与 API 请求均未获得成功响应");
    } catch (err) { fail("现场检查失败（不是通过）: " + String(err)); }
  }
}
if (!process.exitCode) console.log("PASS:", mode, "无需上传真实文件或密钥");
