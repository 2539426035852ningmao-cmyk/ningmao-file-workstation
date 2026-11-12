# W1/W2 Windows WSS 假在线与接收方离线快速终止

此文档对应 Draft PR（基于 #89），不是公网/Windows 实机验收。

## 已查证的问题

1. 网页使用 `SocketHeartbeat`（30 秒 ping，15 秒 pong 超时）；Windows 原生 WSS 旧版本只每 25 秒发送文本 `{"type":"ping"}`，收不到 Worker 的文本 `{"type":"pong"}` 时仍可能保持 `signal_online=true`。
2. Worker `DeviceRoom` 在投递 `invite` 发现目标已离线时发送 `{"type":"unavailable","to":"目标设备UUID","id":"传输任务UUID"}`。Windows 原生旧事件转发只识别来自其他用户设备的 `from`，因此丢弃这条 Worker 级通知，Windows→Web 等待无效超时。
3. 断开 WSS 后旧原生 `accepting` 标志没有同步清理；重新连上后可能继承早前网页接收授权，不符合「每次手动开启接收」安全约束。

## 修正

- Windows Rust 原生事件循环每 5 秒检查心跳状态：首轮及时 ping、正常等待 15 秒文本 pong，缺失则关闭旧会话、清理 online/peers/accepting；收到合法文本 pong 才解除当前等待，成功心跳至少间隔 25 秒。所有状态继续受现有 WSS generation 与一次性授权约束。
- 由可信 WSS Worker 返回的 `unavailable` 只容许带合法 `to` 和 `id` 两个 UUID，并在转发到 WebView 前重建只含这三个字段的受控对象。不能把未知字段、路径或凭据广播给 renderer。
- Windows 发送方 Outbox 仅在 **同时匹配当前目标设备 UUID 和本次任务 UUID** 时立即失败/取消，不能用其他任务的离线回执结束当前任务。接收方 Inbox 同样绑定对端与任务身份。
- 不打开监听端口，不修改 Rust Store/SQLite 文件路径，不自动重新开启接收，也不复用失效 WebSocket 会话。断线后已有手动「连接网页信令」可重连；没有宣称自动恢复完整跨端文件传输。

## 本次自动化

- Rust 单元测试：心跳状态机第一次 ping、持续等待、正常 pong 与下次 ping、15 秒无 pong 超时；Worker `unavailable` 的 UUID 严格校验与字段剥离。
- Chromium Playwright：Windows 主窗口用户选择已授权网页设备发起邀请、收到不匹配的 `unavailable` 不退出，收到匹配的 Worker 通知立即结束、不冒充已保存。
- 需以本 PR **最新 HEAD** 的 Desktop Rust/Playwright、Web Transfer 和 Preview MSI CI 为准；任一红灯继续修复。其他历史 CI 不能继承。

## #77 与 main 集成说明

- 截至本次核查，#77 HEAD `66c7c9dd` 包含旧的 `TransferPanel.tsx`、`transferBackend.ts` 和测试夹具，**不存在** `src-tauri/src/web_device.rs`。因此原生 W1/W2/W3 不是在 #77 上复制一段 JSX 即完成集成。
- 须在独立集成分支逐项合并新增原生模块与 Tauri command/Runtime 注册、共享 `PeerLink` 与 Worker、锁文件以及 UI 三主题；特别比较 #77 和 #89 现有局域网互传/本机浏览器分享逻辑。不要整目录用 ours/theirs 覆盖，也不能抢先把叠放候选直接并入 main。
- 主分支仅文档同步在 #90；真正应用集成仍需跨候选编译、Windows 双机/手机真实文件 SHA、取消/断网、原数据不变与明确审批。

未进行 Cloudflare Access 正式部署、真实公网或用户源文件测试。回滚关闭本 Draft PR 即可；无存储迁移和权限扩张。
