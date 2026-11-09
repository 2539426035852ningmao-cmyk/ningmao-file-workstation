# W3 Windows → 网页发送 · 受控文件源与 W2 DataChannel 对接（候选）

> 以 #88 为基线，在上游 #85 的桌面接收与 W1 原生设备授权体系之上新增 Windows → 浏览器方向。依赖 #87/#88、#85/#84/#83/#82/#81，仍属于 **Draft**。绝不将代码候选误报为公网验收。

## 实现范围

1. Windows 主窗口已有「文件互传」的发送页中，在有效 W1 设备授权/WSS 在线时显示「Windows → 网页 / 手机 · 安全发送」折叠区；保留原有 LAN IPv4 + TLS 指纹互传主路径与三套主题。
2. 只允许显式选择的 **1 个普通文件**：通过既有 Rust `web_transfer_prepare/read_chunk/release` 读取当前 Store 中的引用；受信任 Tauri 窗口权限、生效文件架 scope、最大 64 MiB、SHA256 都由已有 W3 Bridge 验证。原始路径、本机 ticket 不进入 WSS、浏览器或 URL。
3. 与网页端复用同一 `PeerLink` / `invite → decision → description/candidate → DataChannel → receipt` 协议。远端浏览器必须主动接受、校验完整字节和 SHA-256 后才能回执；浏览器仍必须手动保存，不能假报 Windows 已写入网页磁盘。
4. 源文件读取或校验失败不发起邀请；对方拒绝/离线、用户取消、面板关闭、网络错误、建立通道或回执超时都不显示成功。
5. 网页设备在线列表来自 W1 原生 Worker、按账号隔离。不得使用或传递网页 Access JWT、Windows 令牌、Rust Store ticket，不增加匿名磁盘操作或云端文件落盘。
6. `TransferBackend.webOffer` 只是现有 `buildDesktopWebRTCOffer` 的强类型入口，供真实 Tauri 和测试夹具复用，不新建第二套文件源。

## 已添加的自动化回归

- `apps/desktop/tests/browser/web-rtc-outbox.spec.ts`：Windows 已选本机合成文件经 **实际 Chromium RTCPeerConnection / RTCDataChannel** 到模拟网页接收端，核对接收文本与回执语义；对方拒绝；用户取消；本机文件源失效不得发 `invite`。
- 在 test harness 中，原生文件源使用测试注入的受控合成文件，不读取生产文件，也不访问外部网络。生产实现始终调用已有 Rust 安全 Bridge。
- 必须以 **本 PR 最新 HEAD** 的 Desktop CI（前端构建、浏览器回归、Windows Rust/Clippy 如工作流覆盖）和 Preview Package CI 为准；若失败须保留并修复，不把上游历史绿色当当前通过。

## 主分支集成与回滚

`main` 尚未包含完整 `apps/desktop` 与 `apps/web`，不是将本 PR 直接 rebase/merge 到 main 就能安全运行。依赖栈至少为：

- 桌面主工程：#30 → #32 → #35 → #36 → #40 → 后续 P2/P3 综合候选；
- 网页互传：#79 W0 独立视觉、#80/81 UI+协议整合 → #82 W3 原生桥 → #83 W1 Windows 授权 → #84 原生 WSS → #85 Web→Windows → #87 网页恢复 → #88 心跳修复 → **本 PR Windows→Web**；
- #86 是基于 #84 的**平行** WSS 安全实现，不能直接重复合并 #85 的原生信令代码；集成必须使用精确 diff 检查并确保最终只保留一个信令实现；
- 与最新桌面综合候选 #77 有可能出现 TransferPanel、Rust Runtime/Cargo.lock、测试夹具和文档冲突；先做独立集成分支冲突审查、编译/回归和 Windows 受控实机验证，最后人工审查 PR 合并，不得覆盖主工程源码或数据库。

云端 W4 的 Access 域名、费率/额度、生产 DNS、TURN 和跨公网发布 **均未获部署批准**。在这些真实 Gate 未完成前，本 PR 不自动发布，亦不宣布 Windows↔网页实机 LIVE_PASS。

## 手动验收建议（未来独立部署环境）

1. Windows 打开自己明确授权的 W1 配对页，复制临时码；另一台浏览器在已部署并受 Access 保护的网页登陆同一账号，完成授予和 WSS 连接。
2. Windows 文件架选择一个合成 TXT → 选择在线浏览器 → 邀请 → 浏览器确认 → DataChannel → 浏览器显示「已校验」→ 主动下载；对照字节和 SHA256。
3. 重测拒绝、取消、离线、过期、源文件变更、64 MiB 边界及中文文件名；Windows 原文件哈希与数据库引用必须不变。
4. 按另外一个方向浏览器→Windows 校验 Store/jobs 持久化回执；跨 NAT/手机及不同 Windows DPI 另测。所有验收记录附源码 SHA、OS/网络、设备、摘要与回滚。
