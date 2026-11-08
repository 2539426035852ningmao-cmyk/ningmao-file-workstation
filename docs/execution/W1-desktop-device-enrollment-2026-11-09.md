# W1 · Windows 设备授权与网页联动 Gate

2026-11-09，Draft PR #83，叠加 PR #82。此文件只记录候选代码的边界，不能替代真实服务器部署和两台设备测试。

## 已写入并受自动化检查的部分

- 浏览器 apps/web/src/WindowsDevicePairing.tsx：在「我的设备」生成两分钟有效的一次性码，查看当前 Access 账号的 Windows 设备，二次确认撤销。三套主题一致。
- 服务端 apps/web/src/deviceEnrollment.ts 和 worker/device-registry.ts：256-bit 随机码，只存 SHA256，每账号最多一个未领取码，领取一次失效。单设备 24 小时限时 token，重领使旧令牌失效，按账号撤销、过期清理。Durable Object SQLite 原子领取与撤销。
- Worker：浏览器身份依然由 Access RS256 验签。Windows 的 /device-link/claim 仅以一次性码领独立 token；/device-link/connect 要求 Bearer Authorization 请求头和相同设备 ID，路由到该账号 WebRTC 信令房间。撤销时关闭对应 Windows WebSocket。
- Windows apps/desktop/src-tauri/src/web_device.rs：只有内置 Tauri 主窗口能提交设备领取。Rust 自行 HTTPS POST，拒绝非 HTTPS、IP、本地网址、异常端口、路径、账号信息、重定向。当前 token 只留在内存，不传给 React，不存入 SQLite 或日志。退出后需重新配对。
- Windows 原有 TransferPanel：显示网页域名、一次性码输入、授权状态、清除本地短期授权。必须继续显示「身份已获授权 ≠ 已联网传文件」。
- 自动化：Vitest 账户隔离/防重放/到期/错误设备/撤销；浏览器 UI 配对测试；Windows 原生地址校验测试和原始互传面板回归。

## 用户实际路径（需要已批准 Cloudflare 环境）

1. 在受 Cloudflare Access 保护的柠猫网页登录自己的账号，进入「我的设备」，生成一次性码。
2. Windows 软件打开「文件互传」的 W1 授权折叠面板，粘贴已核对的 HTTPS 服务地址和一次性码。
3. Rust 直接向服务端领取设备 token，前端只收到设备名、ID、到期时间，不收到凭据。网页刷新后可见已授权设备。
4. 在网页中可撤销授权，关闭服务端相关连接。Windows 清除本机会话不等于已撤销云端 token，请到网页撤销。

## 上线前必须实测的 Gate

- W1：真实 Access 登录、两个不同账号隔离、Windows 真实领取、token 到期、重放、服务端撤销与断线，Cloudflare 路由频率限制和匿名探测。
- W2：Windows↔浏览器真实 WebRTC 信令与数据通道，Wi-Fi/公网不同网络，必要时 TURN 配置和成本许可。
- W3：Rust Store 本机文件来源与网页消息对接，接收方二次确认，哈希检验和受控目录安全保存，传输中断/重复/拒绝后正确完成或失败。
- W4：经过用户明确批准的独立域名、Cloudflare Access 全站策略、费用配额和回滚；不能自动部署或将测试码/真实文件上传到 CI。

只有 /device-link/claim 与 /device-link/connect 是 W4 需要单独审查的候选 Access 例外路径；不允许直接关闭完整网站 Access。除这两条外的该前缀路径返回 404。必须验证 Worker-first 路由。任何时候不得把 Windows Bearer token、Cloudflare Access JWT、浏览器 Cookie 或本机文件 ticket 放进 URL、控制台或公开仓库。

CI 只证明源代码测试、构建和合成浏览器路径，不代表以上 LIVE Gate 已通过。保留稳定 W0 在线展示和现有 Windows 正式包，不提前合并主分支。
