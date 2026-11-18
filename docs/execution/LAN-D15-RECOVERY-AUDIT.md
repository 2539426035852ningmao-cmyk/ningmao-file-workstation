# D15 局域网互传与恢复调查

2026-11-19。桌面链路已能把选中的文件送入另一个接收目录。当前最需要补验的是两台 Windows 的真实发现、双向传输，以及接收方已经保存、发送方却没有收到回执时的处理。

## 版本与证据

GitHub 的 `develop` 为 `27aa93a8ae6b96e2678baa236cc757a228932e2c`。草稿 PR #103 的 D15 为 `459558c1aad1861f418b244002f76630bcc7ff6c`，从 develop 向前 3 个提交。D14/D15 改动集中在媒体预览、详细列表及其测试，Store 的改动在图片预览函数。局域网协议、任务适配、互传面板及发现代码相同。调查 PR 从 develop 分支，D15 在独立环境复测；两条分支均运行新增回环用例。后续以纳入 D15 的最新 develop 为应用基线。当前交付页仍记录 D13，已验收 D15 的包名及哈希见[交接 PR](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/103)。

| 环境 | 已核对的结果 |
| --- | --- |
| D15 浏览器界面，合成后端 | Windows Chromium，互传、连接引导、空闲状态三个文件共 18 项通过。覆盖默认关闭、选目录、显式接受或拒绝、发现列表、粘贴连接、首次配对、取消和进度。 |
| D15 桌面 Rust，单机 | UDP 回环查询及释放端口 1 项通过。临时目录中重开身份及配对记录、正确及错误指纹的真实 TLS 握手 2 项通过。 |
| D15 源码加本 PR 测试，Windows 隔离回环 | Rust 探针包 38 项通过、1 项原有浏览器事件日志用例跳过。另跑双进程探针，64 MiB 的源/目标 SHA-256 一致。覆盖拒收、同名留存、错误摘要、旧令牌重放、上传中断线与取消、临时文件清理、下一会话成功。见[脱敏结果](LAN-D15-loopback-result.json)。 |
| D15 GitHub CI | [P3 回环](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/44350461866)、[桌面](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/44350461924)、[仓库](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/44350461786)、[预览包](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/44350462081)四个工作流成功。回环工作流每个系统各用一个 runner。 |
| 同机私有网卡 | 11 月 7 日有临时授权下的组播查询、找到设备并释放端口记录。本轮仅复测回环。[原始记录](../research/P3-nearby-devices-20261107.md) |
| 两台实体 Windows / 手机模拟器 | D15 局域网双机双向未验证。手机模拟器本轮未运行。 |
| 实体手机与跨网 | 11 月 9 日旧浏览器分享组件曾发到实体 Android，浏览器显示 78 B 校验成功，手机落盘哈希未独立读取。11 月 12 日公网复测记录了 WSS 与 TLS 失败。WebRTC/WSS 桌面桥接另有候选，D15 跨网双向、休眠唤醒仍待验证。[手机实测](../research/P3-android-public-proof-20261109.md) · [后续失败](../research/P3-public-reliability-20261112.md) · [集成记录](W3-Windows-Web-integration-candidate-2026-11-12.md) |

## 桌面链路

1. 接收方选绑定目录并开启接收。默认端口是 TCP 53317；开启期间在私有 IPv4 接口上加入 UDP 53319 发现组。发送方选文件后查询，可用“复制连接信息”走手动连接。没有文件时打开空发送页不会主动查找。
2. 双方比对六位显示码。发送方以完整 SHA-256 指纹核对接收方 TLS 证书，首次选择附近设备并确认后记住名称和指纹。D15 复用了持久设备身份。桌面使用接收端证书固定，双进程实验另有双向证书模式。设备记忆不提供账户身份；接收方仍须逐批决定。
3. 一批支持 1–16 个普通文件，单文件上限 512 MiB。发送端只读打开所选文件，计算长度及 SHA-256；接收端列出请求。接受后按文件写入绑定目录的临时文件，核对长度和摘要后才发布，目标已存在时编号保留。发送端收到成功响应才计入已确认完成数。
4. 批次支持部分完成。任务中心持久化任务摘要，异常重启会将未完任务标为中断。逐文件结果随发送命令返回；当前没有跨会话收件查询、自动重连、断点续传或只补未完成项的恢复入口。

实现入口见[桌面收发命令](../../apps/desktop/src-tauri/src/transfer_desktop.rs)、[发现](../../apps/desktop/src-tauri/src/transfer_discovery.rs)、[发送端](../../apps/desktop/src-tauri/src/transfer_sender.rs)、[接收端](../../crates/transfer-receiver/src/lib.rs)及[同名发布](../../crates/transfer-receiver/src/destination.rs)。

## 可复现的缺口

| 操作 | Windows 回环观测 | 对验收的影响 |
| --- | --- | --- |
| 接收端已发布，在发送端读取最终响应前中断，然后重新确认发送同一文件 | 测试在客户端边界注入“未读回执”。首次目标已存在；再次发送成功，目标中出现 `sample.txt` 和 `sample (1).txt`，两份与源哈希一致 | 原上传令牌不能重放，但新请求会被当成另一次主动收件。需要区分“恢复旧任务”和“有意再发一份”。 |
| 两项中第一项已完成，第二项传至中途取消，然后原样重发整批 | 首次保留第一项，第二项未发布。新任务又为第一项生成编号副本，第二项完整落盘 | 重试前按文件核对已完成项；仅凭总任务“已取消”不能判断哪些文件已保存。 |
| 发起后，在对方阅读确认框时点击取消 | 受控接收端等待 350 ms，发送端仍未结束。接收方随后同意，发送端才结束为已取消、正文 0 B，目录为空，源哈希不变 | 桌面接收确认窗口最多等 60 秒，客户端等待准备响应的读超时为 90 秒。350 ms 是本机观测值，两个超时是源码值。等待确认期间的取消反馈需要实机计时。 |

另有一处接口差异可从源码核对：Rust 的 `IncomingBatch` 提供逐文件大小；TypeScript 面板还读取 `pending.total`，原生适配器直接返回 IPC 结果，界面测试桩自行填入 `total`。双机验收时记录确认框的文件数、单项及合计大小，当前没有该栏位的 D15 原生截屏。[前端接口](../../apps/desktop/src/transferBackend.ts) · [确认框](../../apps/desktop/src/components/TransferPanel.tsx)

### 复现入口

在独立检出中运行，只用临时目录及合成数据。针对用例复用本仓库的生产收发、任务 Store 和现有探针；未新增依赖。未读回执用例制造可重复的客户端边界条件；物理断网需要在真实设备另验。

```powershell
cargo test --locked --manifest-path experiments/p3-loopback/Cargo.toml --lib direct_event_tests -- --nocapture
cargo test --locked --manifest-path experiments/p3-loopback/Cargo.toml
$proof = Join-Path ([IO.Path]::GetTempPath()) ("ningmao-lan-proof-" + [guid]::NewGuid())
cargo run --locked --manifest-path experiments/p3-loopback/Cargo.toml -- probe $proof
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib transfer_identity::tests
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib transfer_discovery::tests::actual_udp_discovery_and_shutdown
```

已安装桌面前端依赖时，从 `apps/desktop` 运行 `npm run build:test`，然后运行 `npm run test:ui -- transfer.spec.ts transfer-guidance.spec.ts transfer-idle.spec.ts`。CI 或本机只保留脱敏摘要，临时证书、原始会话和工作区文件留在测试机。

## 推荐的首条双设备路径

选用同一可信局域网的两台实体 Windows、同一 D15 便携包、各自独立的数据目录、WebView 配置和合成绑定架。首次真实监听按项目授权。预置一个与待收 TXT 同名但内容不同的文件，记录三个初值：发送文件的字节数和哈希、旧目标哈希。若系统要求更改防火墙，记录阻塞后停止该步骤。

1. B 显式开启接收，A 从“附近设备”选择 B，核对双方显示码。首次在 B 拒收，核对目录及任务；再次发起并接受。比对 A 源、B 编号副本的字节与 SHA-256，确认 B 的旧同名文件不变。若发现为空，单独记录发现失败，再用 B 的连接信息测 TLS 和保存。
2. 关闭 B 接收，换由 A 接收，用不同内容从 B 发回。核对两个方向的终态、目录、新文件数和停止接收后的监听状态。
3. 同一路径增加“小文件＋大文件”批次，分别在第二项中途取消、在传输中的测试设备断开网络。重连后先核对双方逐项结果，再单独发未收全的文件。另以合成目录独立复查“整批重发”所得副本。终态不明时保留现场计数和摘要。记录系统版本、接入方式、两个方向、每步时间、校验及临时文件情况。

一位 LocalSend 用户 11 月 14 日报告家中 Wi-Fi 与热点表现不同。这提示验收时记录接入方式并单列设备发现；柠猫使用自己的发现组和查询格式。技术结论取自本仓库源码及回环实测。[用户原帖](https://www.reddit.com/r/localsend/comments/1xvzm8u/pc_and_android_cant_detect_each_other/) · [LocalSend 原始协议](https://github.com/localsend/protocol/blob/main/README.md)

本轮仅新增测试及验收记录。下一阶段的产品登录、账户设备撤销、跨账户分享和持续同步尚未交付；设备证书记忆和临时网页授权均不能替代这些能力。
