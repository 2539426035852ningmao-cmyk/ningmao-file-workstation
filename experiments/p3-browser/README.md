# croc 浏览器互传隔离证明

Issue #58 / PR #59，2026-11-05。这是 Windows 本机的真实 CLI/Chromium 传输实验，不是柠猫桌面已接入，也不是互联网/手机/双 Windows 验收。

## 固定输入与复用边界

- 上游 [schollz/croc](https://github.com/schollz/croc/tree/4fc5ac0c8463a3de2b0396205c69a38109863583)，完整 SHA `4fc5ac0c8463a3de2b0396205c69a38109863583`。
- MIT，版权 Zack；随附原样 `UPSTREAM-LICENSE.txt`。`windows-e2e.patch` 修改上游 Windows 测试文件名和 CRLF 词表解析；没有更换协议、复制网站资产或向上游推送。
- EFF 词表上游另附 CC-BY-4.0，字体有独立许可证；Go/npm 全部依赖的发行审计尚未完成。当前二进制只本机实验，不进入柠猫发行包。
- 专用 Go 1.27.3 从 go.dev 官方存档下载并与官方 JSON SHA256 比对，通过后解压；未改全局 PATH。npm 通过上游 package-lock 执行 `npm ci --ignore-scripts`。Chromium revision 1228 由该版本 Playwright 官方下载器安装。

## 实际结果

首次准备 FAIL：Playwright 将依赖下载/冷编译算入 120 秒服务启动期限，超时，尚未开始传输。复跑器先完成冷编译，保留原启动期限。

其次启动 FAIL：Windows 无扩展名 PE 不能被上游 Node spawn 按预期启动，返回 ENOENT。通过固定 `.exe` CLI 名称和最小 Windows web/teardown 后缀补丁解决。

首轮链路 3 PASS / 3 FAIL：浏览器生成配对词夹带 CR 字符；git autocrlf=true 导致词表落地为 CRLF，而上游按 LF 分割。现有 `codephrase.test.ts` 在修复前 2 FAIL/1 PASS，源头改为 `/\r?\n/` 后 3 PASS。没有手改生成的网页产物，修复后重新 embed。

最终 Chromium E2E **6/6 PASS，27.5 秒**：

| 实际上游测试 | 证明范围 |
| --- | --- |
| Web → CLI transfers and verifies multiple files | 3 个合成文件实际写入隔离目标并与源内容比较 |
| Web → Web transfers and verifies multiple files | 两个隔离浏览器上下文实际传输/下载并比较内容 |
| CLI → Web rejects a wrong password before offering metadata | 错码拒绝，不提供文件元数据 |
| cancels a pending handshake and starts another receive without reloading | 取消等待并可重新接收 |
| small-file bundles CLI → Web preserve individual downloads | CLI 发、浏览器逐文件下载，内容一致 |
| small-file bundles cancel an active payload and retry without reloading | 活跃传输取消后同页重试成功 |

取消专项通过测试钩子延缓实际 worker 编码，让取消时机可重复；没有用模拟传输替代网络。文件使用上游确定性合成字节（含空文件）。Playwright 正常退出码 0，`.last-run.json` 为 passed 且 failedTests 空。测试进程退出、测试端口 6 个均无监听；未修改防火墙或访问私人文件。没有上传文件到公共中继，也未调用 AI。

上游测试为隔离目录使用 `--yes --overwrite`，这不证明同名保护或人工接收已合格，产品适配器不得继承这些测试参数。当前网页在实验中还包含未选用的 SSH/Store 编译资产，不能将整包当成最小产品；正式接入只开放文件互传。

## 复跑

克隆并 detached checkout 上述固定 SHA 到新的独立目录。安装 Go 1.27.3、Node/npm，在上游 web 运行 `npm ci --ignore-scripts --no-audit --no-fund` 及 `npx playwright install chromium`。然后运行本仓库脚本，参数全部使用专用可写目录：

```powershell
./experiments/p3-browser/run-proof.ps1 `
  -UpstreamDirectory '<isolated-croc-checkout>' `
  -GoBinDirectory '<go-root>/bin' `
  -GoPathDirectory '<dedicated-modules>' `
  -BuildCacheDirectory '<dedicated-build-cache>'
```

复跑器核对 SHA 和补丁精确内容，只允许记录过的上游修改，复用上游真实单测与 E2E。只用 127.0.0.1 动态端口；环境原值恢复，专用源码保留记录的补丁，生成资产由上游脚本重建。上游 teardown 会清理其 `.e2e` 测试进程/目录，因此仅对专用克隆运行。原始测试 trace/日志可能包含一次性合成配对码，只保留本机，不提交仓库。

下一交付：将已验证协议包装为柠猫可停止的文件分享适配器，接入现有任务中心，并补逐批确认/不覆盖保护；之后再部署 HTTPS 与受控中继，验证真正跨网和手机。新适配器未通过时保持 r4 和 LAN 不变。
