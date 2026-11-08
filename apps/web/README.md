# 柠猫 Transfer · Web MVP (W0–W2 候选)

**设计规范：** [全项目 design.md](../../design.md) 为唯一规则源头；[Web UI/UX 实施指南](../../docs/design/WEB-UI-UX-GUIDE-2026-11-09.md) 用于本网页的组件选择、微交互和验收。未经检查不得自动引入展示模板或 Pro 代码。

此目录是柠猫文件工作站的**独立浏览器前端与信令服务**，不修改桌面端的 Tauri/SQLite/文件安全逻辑。当前不代表已部署、正式发布或已通过真实双机测试。

## 首版范围

- 已编写：浅白/深蓝/亮蓝三套完整主题、移动端响应式、文件拖入/选择、设备显示、接收确认、取消、传输任务和 SHA-256 验证。
- 已编写：Cloudflare Access JWT 验证、按账号隔离的 Durable Object 在线设备与 WebSocket 信令；WebRTC DataChannel 加密点对点传输。
- 限制：**同一个 Access 用户的不同浏览器**。单文件最大 64 MiB；接收后需主动点「保存」；浏览器刷新后暂不保留记录；尚无断点续传、TURN 中继、跨账号分享、Windows 桌面端原生桥接、云端离线寄存；跨不同网络可能因 NAT/防火墙失败。
- 不提供本地任意目录访问；不使用仓库历史 Debug 浏览器中继/固定密码；不上传文件内容到 Worker。浏览器端通过 SHA-256 校验后才提供保存链接。

## 本地开发

在 apps/web 目录运行：

```sh
npm install
npm run dev
npm test
npm run build
```

普通 Vite dev server **只有 UI 预览**，不会跳过账号验证，也不提供假设备/假登录。生产功能必须通过下述 Cloudflare Access 环境测试。部署配置中有故意的占位变量，未配置时 API 返回 401，避免匿名公网暴露信令。

## Cloudflare 部署步骤（需所有者明确授权）

1. 在 Cloudflare Zero Trust 建立 Access **Self-hosted** 应用，保护最终 Worker 域名（覆盖 `/api/*` 与站点）；只允许自己的邮箱或已批准的测试用户。
2. 将 `wrangler.jsonc` 的 `CF_ACCESS_TEAM_DOMAIN` 替换为 `<team>.cloudflareaccess.com`，`CF_ACCESS_AUD` 替换为该 Access 应用 AUD。该字段不是密钥，但不得提交任何真实用户密钥/会话 JWT。
3. 根据 Cloudflare 套餐/对象计费确认后，执行 `npm run deploy`。先选择可控测试域名和访问策略，不自动绑定正式域名、DNS、R2 或公开监听端口。
4. 两个独立浏览器用同一个 Access 身份登录网页；页面自动发现对方；选文件、选设备、发送、接收端确认，然后接收端点击保存。
5. 实际验收：Chrome/Edge 双端、Android Chrome/iOS Safari、不同网络，检查 SHA256、拒收、取消、断线、大小限制。仅手机模拟器不能当实机验收。

**安全说明：** Worker 对每个 API 请求都校验 Access JWT 的 RS256 签名、issuer、audience 和过期时间。Durable Object 只负责同一 subject 的设备列表及信令；不传文件字节。WebRTC 使用 DTLS 加密；首版公共 Google STUN 服务器可看到相关网络元数据。账号凭据由 Cloudflare Access 托管，不能使用普通 Vite 开发服务替代安全边界。

## 部署后验收矩阵

| 检查 | 预期 |
|---|---|
| 未登录访问 API | 401/Access 登录，不泄露设备信息 |
| 登录两个不同身份 | 相互不可发现，不可跨账号发送 |
| 同一身份开两个浏览器 | 双方出现在在线设备列表 |
| 接收端拒收 | 发送结束且不会落盘 |
| 发送端取消 | 不出现成功状态 |
| 文件损坏 | SHA 校验失败且不提供保存 |
| 64 MiB 以上文件 | UI 阻止发送 |
| 断开网络/关闭标签页 | 对方离线，未完成任务不可声称成功 |
| 真实跨网络 | 记录 ICE/是否直连、失败时明确 TURN 需求 |

## 与桌面客户端集成

下一阶段独立设计 `web-transfer-adapter`，由 Windows 客户端主动连接经过身份授权的 HTTPS/WSS 服务。严禁把现有 Debug-only `127.0.0.1:53318–53323` relay 直接发布到公网；桌面文件读取/保存必须经过现有受控范围、目标目录与安全 Copy 冲突策略。只有真实 Windows↔网页端验证通过才标记 W3 PASS。

## 回滚

本目录不改变桌面源码/数据库；关闭 Cloudflare Worker 域名入口即可停止公网 Web；Git 回退此分支/PR 即回退网页代码。保留现有 #77 独立集成候选及用户文件不变。

## 统一界面与联网能力候选（PR #81）

**分支** `feat/web-unified-ux-20261109`（基于 W1–W4 PR #80，不替换原 W0 正式预览）：
- 复用已通过 Chromium 实际操作测试的 W0 主页面、三套完整主题、本地队列、文件预览、筛选与文件名安全检查。
- 将现有 PR #80 WebRTC/Access/Worker 逻辑抽离到 `useTransferController.ts`。**不重新实现另一套信令、哈希或账号**。
- W2 首轮联网 UI：服务器验证登录后显示真实设备、选一个已准备文件→设备→发送→接收方确认/拒绝→WebRTC SHA-256→主动保存。多文件可加入本地队列，**联网每次仍只发送一个选中项**；不能混淆本地准备和实际发送。
- 传输任务仅根据真实事件更新；接收方校验通过 ≠ 用户已保存。
- 本分支尚未进行真实 Access 登录、两台设备/跨公网/Windows 接收落盘验收；GitHub Pages 持续只承载独立 W0 静态预览，**没有上线这个未验收的联网候选**。
- Windows Native Source Bridge、DPAPI 配对、受控接收及 jobs、W4 公网费用/身份审批继续沿 PR #80 Gate，独立验收与合并。

