# W2 网页前端：准备期取消、断线重连与任务隔离（候选）

> 本页记录在 `feat/web-w2-w3-native-rtc-bridge-20261109` 之上的增量。依赖 W1 PR #83/#84 与 W2/W3 PR #85；当前仍是 Draft 候选，**不代表公网服务已经部署或文件已经在 Windows 实机保存**。

## 本轮变更

1. 在 `File.arrayBuffer()` 和 SHA-256 摘要计算**之前**建立发送任务。用户可以在准备阶段取消；迟到的异步结果不能再发出 invite，也不能把已取消任务改为成功。
2. 拒绝在一个发送任务准备期接受其它邀请；复用已存在的 W1 同账号信令、W2 PeerLink，不建立第二条 WebSocket。
3. 临时 `/api/me` 503、网络失败和 WebSocket 关闭均可以自动按 3.5 秒间隔重试；401/403 要求重新登录，不做无限轮询。尝试恢复网络期间保留本地文件队列，不再因点击“重试”强制刷新清空队列。
4. RTC 回调按原任务 ID 与对端设备 ID 校验，旧任务的延迟进度、成功、错误不能覆盖新会话；校验完成后暂保留通道直到发送方收到确认；新任务开始或连接断开时关闭旧连接，避免提前断开造成误报。**SHA 校验通过仍需用户点击保存，不能宣称磁盘已保存。**

## 浏览器自动化验收

`apps/web/tests/browser/web-recovery.spec.ts` 新增：
- 延迟 `File.arrayBuffer` 时取消任务，确认没有发送远端邀请；
- 首次 503、随后返回 200 的自动恢复，无页面刷新；
- 401 认证失败不无限重试。

与原有 `ui-transfer-bridge.spec.ts`、`web-rtc.spec.ts`、`web-preview.spec.ts` 一起由 Web Transfer CI 执行。必须以**当前 PR 最新 HEAD** 的 GitHub Actions 结果判定，不以旧分支结果替代。

## 仍待验证的真实 Gate

- Cloudflare Access 保护、Worker/DO 在线信令和 Windows 原生 WSS 的真实多端联调；
- WebRTC 跨 NAT/TURN、断线中断、Android/iOS 手机浏览器；
- Windows W3 受控文件源/保存目录、SHA256 验证、冲突策略、任务 Store 的真实写盘回执；
- 超大文件、弱网、文件读取失败、撤销授权等实机边界。

**W4 部署继续保持禁止**，未经项目所有者批准不得部署 Cloudflare、开放匿名接收或改变主分支/现有 W0 预览。此分支仅用于可审查的代码候选，不改变本机文件系统安全边界。
