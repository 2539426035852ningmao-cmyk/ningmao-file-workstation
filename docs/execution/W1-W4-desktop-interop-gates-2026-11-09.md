# 柠猫 Transfer · W1–W4 网页与 Windows 工作站对接 Gate

> 当前为 Draft PR #82（基于 #81 → #80）。这份文档约束今后的实际联通实施，不代表已部署或双机实测通过。保留 GitHub Pages W0 稳定预览，不把当前未验证的公网代码自动发布。最后复核：2026-11-09。

## 阶段目标与已有证据

| 层级 | 已有实现与所在位置 | 未过的真实部署/联通 Gate |
|---|---|---|
| W0 UI | #79 GitHub Pages 稳定预览；三套主题；本地文件准备/预览/筛选、移动端适配 | UI 版本统一后，不能降低 W0 现有验收 |
| W1 身份 | #80 Worker 上 RS256 Access JWT 服务端验签、按 subject 隔离设备房间；#81 单标签会话去重 | **Windows 尚无可信服务端设备授权/撤销/令牌续期**，必须通过真实浏览器授权流程，不复制 Access Cookie、JWT 或登录密码 |
| W2 通道 | #81 两隔离 Chromium 会话合成信令下完成发送、接受、RTC、SHA256、浏览器下载；严格任务 ID、1 文件/次 | 真实 Access 登录、PC↔手机/Wi-Fi/跨公网/TURN、失败/拒收/取消与会话恢复 |
| W3 Windows 对接 | #80 本机受控引用 source bridge；#82 原生接收器临时分块/本机确认/哈希/Store 安全复制/jobs；原有 TransferPanel 新增真实本机文件来源预检 | 将**可信 Windows 会话的 WSS+WebRTC** 接到本机 source/receive adapter；同账号配对、接收保存、任务与真实窗口通知；跨架拒绝 |
| W4 部署治理 | 构建、dry-run、source preflight；#82 将 npm deploy 入口默认关闭，只有显式环境审批才放行；继续 W0 Pages | 域名、Access 全站策略、Worker/DO 配额、TURN 是否需要、真实不同网络和 Windows 安装体验、回滚 |

## 单一 Windows 工作台交互闭环（不得再建一套传输页）

入口：现有 `apps/desktop/src/components/TransferPanel.tsx`。继续承载 **局域网电脑互传、仅本机的浏览器测试、W1–W4 Web/手机互传**，但用真实设备类型和状态隔离，不混为一谈。

**发送：**

1. 用户在工作站文件架选真实文件引用（首版每次 1 文件），点击传输面板中的 Web 联动；`webSourceInfo` 已可核验 Rust Store 文件引用并释放源票据（不能将「已校验」表述为「已发送」）。
2. W1 使用 Windows 主动发起的短期设备授权，用户在默认浏览器内的受保护网页登录和明确授权；**Windows 不能导入网页 Cookie/JWT**。云端签发 account-bound、device-bound、可撤销凭据，Windows 尽量使用操作系统 DPAPI 保存。设备 UUID 只是路由标识。
3. W2 只有会话鉴权和目标设备在线均成功时才开放按钮；对方明确同意后 RTC 发送，任务状态来自真实事件；必须可取消和超时。
4. Rust Source Bridge `web_transfer_prepare/read_chunk/release` 每次限 64MiB，64KiB 分块；任何时刻不发送本机票据或真实路径；原文件不移动。网页按相同摘要验证后才提供保存操作。

**接收：**

1. 同账号通过合法的已授权设备会话收到 invite。Windows 用户可拒绝；接受后本机必须再次经过受信任 Tauri WebView 所触发的原生批准，严禁页面静默落盘。
2. `web_receive_prepare` 仅允许当前权限窗口和已存在的绑定文件架；不接收远端指定的保存路径、文件系统命令或可执行代码。
3. `web_receive_append` 连续偏移 + 64KiB 严格限额 + 10 分钟超时，字节送入应用管理的临时目录；失败、取消、超时要清理，不能改写原文件。
4. `web_receive_finish` 比对字节数与 SHA256，复用 `Store::copy_one` 的唯一目标名与冲突安全，SQLite job 终态成功后才发「已保存」；如果终态落库失败，应要求核对目录，**不得重试并造成重复副本**。
5. 真实传输后的「传输记录」展示任务 ID、来源设备、已验证/已保存区别、保存文件架和可操作的打开/定位；当前还没有 WSS→Rust 网络输入，因此不能宣称整条流程已联通。

## 必须先解决的 W1 身份难点

Worker 当前 `/api/*` 强制 Access JWT，Windows WebView 是本机可信 UI 而不是已登录的公开网页；不能仅指向同一个 WSS URL 就称为配对成功。后续实现设备码/OAuth 授权模式时：
- **由受保护的网页明确批准一次 Windows 设备**，云端核验 Access subject；向桌面签发有限时长、可单设备撤销的令牌，不能提供无限期公网匿名设备链接。
- 云端凭证与本机 `web_transfer_prepare` ticket 严格分离；前者只做账号身份与信令，后者只授权本机一个文件引用。
- 使用 HTTPS/WSS；如果需要未登录的设备码领取端点，必须单独设计 Access Bypass 的窄路径、速率限制、到期删除与重放防护。**未审查前不得直接为整个网站关闭 Cloudflare Access**。
- 先验证同账号可发现，异账号绝不可互见，再接上传输字节。

## CI、实测与发布不许混淆

- PR #82 使用 Windows GitHub Actions 跑 Rust fmt/clippy/tests、原生构建以及 Chromium 桌面测试；Web CI 跑 Vite/Vitest/Chromium/Worker dry-run。新加跨平台文件名/协议一致性测试：**64 MiB / 64 KiB / 200 UTF-8 字节**。
- 自动化中的两个 Chromium 会话和模拟信令，只能称为「合成端到端测试」，不能称为公网实测或用户电脑已安装。
- 使用由测试生成的 TXT/PNG，至少四个拓扑：同机不同浏览器、两台 Windows 同局域网、Windows↔手机同局域网、Windows↔手机不同公网；覆盖拒收、取消、掉线、同名文件、长中文名、反向传输与 Store/journal 重启。
- W4 发布必须先经所有者明确批准独立域名、Access policy、计费和 TURN 策略，默认 `npm run deploy` 拒绝运行。不能上传真实文件到 GitHub Actions；不得调用调试版 Go/croc 本机固定口令作为公网中继。
- 合格标准：每项有 SHA/CI 结果、设备与系统、实际网络、SHA256 文件对比、接受/拒绝截图或日志、任务终态、是否遗留监听端口、成本和可回滚版本。任何未验证项填 `NOT_TESTED`，不填 PASS。

## 开发分支整合顺序

`#79 W0`（现有 Pages 稳定预览）→`#80 W1/W2/W3 Source`→`#81 统一 UI`→`#82 Windows 接收与面板`。整合必须在同一条目标分支上 **rebase 或 cherry-pick 有选择地吸收**，不要简单同时 merge 重叠的 `apps/web` 目录，避免覆盖 W0 功能。主分支与稳定 Windows 安装包保持不变，直到 W1–W4 的实际 Gate 完成。
