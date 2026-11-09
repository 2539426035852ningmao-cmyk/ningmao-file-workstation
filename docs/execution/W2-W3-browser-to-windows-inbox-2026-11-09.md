# W2/W3 浏览器 → Windows 接收链路（Draft PR #85）

2026-11-09；此分支叠加 PR #84（Windows 原生 WSS）、#83（设备授权）、#82（Rust 文件架暂存与安全保存）。仍是开发候选，**未部署 Cloudflare、未通过真实跨设备/公网验证、未合并主分支**。

## 一条真实的应用调用路径

已登录账号的浏览器 → Worker Access JWT 验证 → 同账号 DeviceRoom 信令 → Windows Rust 使用独立设备 Bearer 建立 WSS → WebView 收到有限 invite 信息 → Windows 用户手动开启接收并确认文件 + 目标绑定文件架 → WebRTC RTCDataChannel 传输真实字节 → PeerLink 核对长度和 SHA256 → saveAcceptedWebFile 再次核对 → 原生 web_receive_prepare/append/finish → Store 安全复制、同名重命名、记录 job → 仅在原生 completed 后回发 receipt(ok=true,persisted=true)。

**W1 已授权 ≠ 信令在线 ≠ 已同意 ≠ 数据已校验 ≠ 文件已保存。** 只有最后一步才能显示“已保存”。

## 核心文件

- apps/desktop/src-tauri/src/web_device.rs：身份只在 Rust 内存；有界 32 条发送队列、16KiB 信令限长、已知在线设备约束、默认拒收、明确的 set_receiving 开关，离线/重配清空授权。
- apps/desktop/src/transferBackend.ts：暴露受限 IPC 与无凭据的信令事件，WebView 不接触 Bearer 或本地来源票据。
- apps/desktop/src/components/DesktopWebInbox.tsx：在原有文件互传面板里接受用户打开的单个文件请求，60 秒确认超时、120 秒 RTC 超时、取消、拒收及哈希核验。
- apps/desktop/src/webReceiveBackend.ts：二次 SHA256 校验、64 KiB 块提交、原生 job 终态检查、失败中止。
- apps/web/src/useTransferController.ts：当 persisted=true 才提示 Windows 已保存，纯浏览器仍提示文件需自行保存。
- apps/desktop/tests/browser/web-rtc-inbox-consent.spec.ts：覆盖默认拒收、主动拒收、绑定文件架确认、取消，以及本地 RTCDataChannel 真字节加模拟原生 Store 的顺序验收。

## 当前限制与需要继续推进的闭环

1. 首期单次一个普通文件，64 MiB 上限、200 UTF-8 字节文件名。只用 STUN，无 TURN：部分局域网/公网/NAT 组合可能无法直连。
2. WebRTC 内部与本机安全保存接口已有接线，但仍需 Chrome + Windows 真机的 Access 登录、WSS、NAT 穿透、原生 Store 真实文件写入证据。自动化模拟 Store 不等于实机通过。
3. 现阶段优先实现浏览器 → Windows。反向 Windows → 浏览器尚需将 buildDesktopWebRTCOffer、在线目标选择、邀请/同意、PeerLink Sender、接收方下载核验串入原面板，不可称双向闭环。
4. W4 Cloudflare 域名、全站 Access、精确路径例外、WAF 速率限制、DO 额度、TURN 费用与回滚，需要所有者明确批准。当前禁止自动发布。
5. 本地任务取消、关闭面板、网络断线、异常文件名、超出容量、恶意信令、SHA 不符或无绑定目录，必须清理暂存、不覆盖原件、不显示成功。

## 真机验收清单

- Windows 软件 + 同机受保护浏览器：接收 TXT、PNG、中文命名文件，核对双方 SHA256、Store job ID、最终文件架及真实落盘。
- Windows 与手机同 Wi-Fi：拒收/允许/取消/重连、同名自动重命名与面板 340px 键盘交互。
- 两台 Windows 与跨公网手机：账号隔离、Access 撤销即时断开、无 TURN 时清楚报错、不误报发送成功。
- 完成独立 Windows→网页反向传输后再做完整双向 PASS；未测内容标为 NOT_TESTED。

**现有 GitHub Pages W0、主分支和正式 Windows 版本保持不变；所有候选仍在 Draft PR 内。**
