# W2 网页传输心跳失联检测（候选）

基于 Draft PR #87 的 `fix/web-preparation-cancel-reconnect-20261109` 分支；依赖 #85 及其上游 W1/W3 分支。本记录只涉及网页传输控制器，不替换 Windows 原有局域网互传，也不修改三主题设计。

## 用户可感知的修正

- 原浏览器每 30 秒发送 `ping`，但即使服务端不回 `pong` 也可能继续显示「已连接」。现在**每次心跳必须在 15 秒内收到 Worker 的真实 `pong`**，否则判定当前会话失联。
- 心跳超时、WebSocket 错误或正常关闭统一清理任务及临时的 RTC 信令状态：在线列表清空；未完成任务标记「网络中断，未确认完成」，不会冒充已发送或已写盘。
- 沿用 #87 的每 3.5 秒重连与身份重新验证；恢复前不显示伪在线设备，用户在浏览器内已添加的本地文件队列不丢失。
- 仅当前套接字的事件能清除当前会话；迟到的旧 socket 关闭事件不能覆盖新连接状态。
- 所有心跳定时器随断线/组件卸载停用，避免多路计时器和失效会话继续产生副作用。

## 自动化验证

`apps/web/tests/socket-heartbeat.test.ts` 使用 Vitest 虚拟时钟覆盖：缺少 pong 的超时、收到 pong 的持续在线、重复 start 幂等、发送失败后一次性断连，以及 stop 后不再发送心跳。

在本 PR 对应的 `Web Transfer CI` 运行结束前，以上仅为已提交测试代码，不能称为测试通过；CI 需执行 Vitest、TypeScript/Vite、Worker dry-run 与 Playwright。只有模拟 Worker 事件，并非公网失联实测。

## 不在本变更范围

- Cloudflare Access/W4 正式部署、收费资源、真实公网域名、TURN、真实双机/跨 NAT/手机网络；
- Windows W2 反向发送、W3 Store 实机文件保存与 SQLite 任务持久化确认；
- UI 公开预览的联网化。本 PR 不发布、不合并 `main`，实际浏览器与 Windows 双向互传继续保持 **NOT_TESTED**。

回滚：撤销本 PR 或复原 `socket-heartbeat.ts` 和 `useTransferController.ts` 的心跳改动即可；无本地数据库或文件格式迁移。
