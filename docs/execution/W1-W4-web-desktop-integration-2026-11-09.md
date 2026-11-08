# W1–W4 网页与 Windows 联动实施和验收记录

> 2026-11-09，候选 PR #80（基于联网版 #78；#79 是独立 W0 视觉基础，不要将两个 apps/web 目录直接合并）。此文档属于开发合同，**不能代替公网和双机实测**。遵守根 `design.md`、`AGENTS.md` 以及原 43 + P4 44 项安全决策。

## 当前交付界限

| 阶段 | 已编写 / 可自动测 | 必须再验证才可宣称可用 |
|---|---|---|
| W1 | Cloudflare Access RS256/JWKS/issuer/audience 校验；用户 `sub` 作为 Durable Object 隔离键；浏览器设备列表 | 真实 Access 登录、独立账号隔离、身份撤销、完整设备生命周期 |
| W2 | WebRTC DataChannel、确认/拒绝/取消、SHA-256、64 MiB 上限、对每个任务 ID 绑定的信令和超时 | 两个独立浏览器双向实际字节、断网/丢包、跨公网 NAT/TURN、手机真机 |
| W3 | Rust/Tauri 本机 **Source Bridge**：`web_transfer_prepare`、`web_transfer_read_chunk`、`web_transfer_release`，仍使用 Store scope + 当前文件架及本机窗口来源校验 | 网页登录如何绑定 Windows 身份、WebRTC↔Rust 帧传输、Windows 接收保存、安全 Copy/jobs、双 OS、用户实机 |
| W4 | Wrangler Worker + Durable Objects SQLite + 静态网页配置、单元测试/构建/dry-run、发布前置检查脚本 | 已批准账户/域名/Access 策略、公网部署、负载/费用、iOS/Android/Windows 实测和回滚演练 |

## W1：统一身份而非另造独立密码系统

- 首版使用 Cloudflare Access 的合法身份会话，不用网页 localStorage 里的设备 ID 当作认证证明。所有 `/api/*` 请求在 Worker 后端重新验证 JWT。
- 同一 Access subject 可看到本账号其他在线浏览器。**这不是持久信任设备登记/撤销机制**，不能用简单显示设备 ID 冒充完成配对。
- Windows 不可直接复制浏览器 Cookie/Access JWT 到数据库，不允许从桌面打开无鉴权的任意公网 websocket。后续由用户明确操作的 OAuth/设备码授予短期、受限、可撤销凭据，秘密存储于 Windows DPAPI，服务端验证归属，用户可撤销。未经验证之前不能自动启用桌面公网监听。
- 现阶段缺 Cloudflare 授权和真实域名，真实身份属于 `NOT_TESTED`；不得生成、提交或要求公开粘贴 Token。

## W2：浏览器真实发送

- `invite` 元数据至多一个 64 MiB 普通文件；对端显示来源设备、文件名和大小，并主动确认。
- 所有信令有 `payload.id` 任务 ID，WebRTC offer/answer/ICE 仅接受当前任务 ID + 当前来源设备。异常结构、超长消息和跨账号路由在服务端拒绝。
- 发送端读取源文件、计算 SHA-256，经 WebRTC 有序 DataChannel 分块发送；接收端在完整字节数/哈希匹配之后提供浏览器保存。传输中断不得标为成功；未主动保存不得称已落盘。
- 现阶段使用公共 STUN；STUN 服务方可能看到连接相关的网络元数据。严格 NAT 环境可能无法直连；未来如用 TURN 中继，须对费用、媒体/数据保护、密钥和实际拓扑另审。
- 执行：两个独立 OS/浏览器（双向合成 TXT/PNG，单文件、拒收、取消、刷新/断网）、SHA256 与各自状态证据。只有真实数据通道跑通才标 W2 `LIVE_PASS`。

## W3：与 Windows 的原生 API 对接

现有桌面候选使用 Tauri 2 + Rust + SQLite。新 Source Bridge 是**只负责把用户选择的文件安全地提供给本机受信任 renderer 的源侧适配**，不是公网共享接口：

```text
Windows 文件架选中引用 (已有 Store/Scope)
   ↓ 用户主动触发
web_transfer_prepare (1 文件；本机 URL/窗口校验；短时 ticket)
   ↓ web_transfer_read_chunk (每次 ≤64 KiB；源文件变化则中断)
本机可信 React/Tauri Renderer
   ↓ 待实现的受限身份 + WebRTC/WSS 传输适配
网页端接收（需确认 + SHA256）
```

- Bridge 不接受任意路径、URL、目录或符号链接，不扫描全盘；所有文件来源是 Store 原有记录，并且只允许发起窗口读取自己准备的票据。
- 本机票据不是云端认证令牌；不得把它发到远端网页、日志或分享 URL。
- 旧 `browser_share_desktop.rs` 的 Debug-only Go/croc 本机测试 `127.0.0.1:53318–53323` 与固定测试口令不能直接公开，也不等同于 W2 WebRTC。
- 双向接收必须使用受控目录、已存在的安全复制/同名编号、不覆盖来源、临时文件 SHA/原子完成、明确接受/拒绝/取消，并通过 `TransferTasks` 和 `jobs` 记录真实任务状态。**不能让接收网页直接指定磁盘路径。**
- 来源文件变更/失效、跨架调用、非本机 WebView、被撤销票据都必须失败；测试也必须验证没有任何用户文件丢失。
- Windows 实际联调前不应在桌面 UI 放置可点但无法真正发送的“网页已连接”按钮。

## W4：部署门槛（不自动执行）

1. Cloudflare 账户所有者明确批准测试域名、访问范围、额度及费用上限；使用独立应用，不修改桌面文件服务或生产 DNS。
2. 对整个站点及 `/api/*` 配置 Cloudflare Access Self-hosted 应用，先只允许自己的邮箱。后端验证 `CF_ACCESS_TEAM_DOMAIN` 和 `CF_ACCESS_AUD`；不要将这些值当成密码，但**任何真实 Access JWT/服务 Token 不进入公开仓库**。
3. `apps/web/wrangler.jsonc` 为占位配置。先 `npm run preflight:source`、`npm run build`、`npx wrangler deploy --dry-run`；实际凭证注入与部署须另行明确授权。
4. 配置完成后运行 `npm run preflight:deploy`。仅在已批准公网域名部署后，用无 Cookie 的独立终端设 `NINGMAO_WEB_URL=https://... ` 跑 `npm run preflight:live`，确认未登录用户不能访问整站和 API。
5. 用不同 Access subject 验证设备不可互见，登录同一 subject 两浏览器互见；发送和接收合成文件并检查哈希一致。Cloudflare Quick Tunnel 临时 URL 不能代表稳定域名或成本承诺。
6. 确认日志没有路径、凭据和文件明文，服务停用后连接与分享均失效；回滚先关闭入口/访问策略，再回滚 Worker 版本，不删用户设备数据或原生库。
7. Cloudflare Workers / DO、可能新增的 TURN 或 R2 都有当前计划和额度约束。没有费用确认则不启用寄存、离线保存、公开中继或多 GB 自动上传。

## 验收判据

每一 Gate 输出 `source SHA / build SHA / OS与浏览器 / 网络拓扑 / 合成文件大小及SHA256 / 录屏或任务终态 / PASS·FAIL·PARTIAL·NOT_TESTED / 残留监听 / 费用 / 回滚`。

真正发布为“浏览器与 Windows 可双向互传”至少需要 **W1 LIVE + W2 双端 LIVE + W3 原生收发 LIVE + W4 HTTPS 可访问及安全/费用检查**，并通过独立 Windows 实机测试。任何一项未满足时，仍是开发候选。
