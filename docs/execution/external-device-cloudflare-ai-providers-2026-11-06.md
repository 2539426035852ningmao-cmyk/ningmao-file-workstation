# 首版外部设备、Cloudflare 公网与多厂商 AI 实施合同（2026-11-06）

> 状态：实施合同 / 尚未配置外部账号与公网资源 / 尚未执行真实跨端与真实模型验收
> 代码基线：[Draft #62](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/62)，审查 HEAD `ffb8bc8ea8568544e28ec5e0103c6f064b15a4e9`；开发时以最新远端 HEAD 为准。
> 本文不修改产品设计 D05、既有 P2 文件安全、P3 LAN 和 P4 AI 合同。唯一实时执行状态文件继续是 [ACTIVE-DELIVERY.md](ACTIVE-DELIVERY.md)。
> 用户已告知：可使用 GitHub Windows 云 Runner、Android/iOS 云手机、本人 LM Studio（如可用）及 OpenRouter 免费模型额度；用户拥有 Cloudflare Dashboard 账号。账号、API 密钥、Cloudflare Token **未**提供给代码仓库，也不应索要聊天粘贴。

## 0. 给 Codex 的立即执行指令

直接沿 `#62 → 独立安全切片 → 同一候选集成` 推进，不再重复选型问卷，不为了测试环境大规模改造应用。

先做 T0/T1 中可免费、无需账号权限、无外部数据的代码和自动化工作；真实外部网络及云账号操作按 G0–G4 关卡逐项开启。每个阶段交付 **代码/测试、精确 SHA、运行记录、合成文件 SHA256、PASS/FAIL/PARTIAL/NOT_TESTED、失败原因、回滚点**。不能仅提交研究报告。

独立短切片；不直接改 protected main，不合并/发布、不运行私人素材、不创建付费资源。先把已有浏览器分享组件的完整许可/产物清关和同版本端到端 GUI 复测列为最高优先 S1；MORPH-02 技术探针不阻塞网络或 AI 测试的独立开发。

## 1. 已证实的代码事实与边界

- `apps/desktop/src-tauri/src/chat.rs` 当前只有 OpenAI Chat Completions SSE 路线：由 Base URL 拼接 `/chat/completions`，使用 Bearer Key、文本 `choices[0].delta.content`，120s 超时，DPAPI 密钥保护，localhost HTTP / 远端 HTTPS 和 DNS 私网地址校验。**不能据此声称已支持 Anthropic 原生 Messages API 或所有厂商协议。**
- `apps/desktop/src/chatBackend.ts` 有 config/test/sessions/messages/send/stop/subscribe；先复用会话和聊天面板，新增薄 Provider 协议适配，而非重做 UI、数据库、Agent 框架。
- `apps/desktop/src-tauri/src/browser_share_desktop.rs` 使用 Debug 限定 Go relay/web/share 组件、SHA 校验、`127.0.0.1:53318–53323` 与公开开发常量 `ningmao-local-preview`；**绝不可原封不动连接公网。**
- r7 已证明 Debug 特定源码的 Windows 主程序→IPC→本机 Chromium 接收及取消；r7 普通便携包**未**打包正式 Go/web 组件，分享功能隐藏。真实 LAN 双 Windows、手机、跨公网与实际 AI 模型仍 NOT_TESTED。
- `.github/workflows/desktop.yml` 已有 Windows Runner 编译+Rust 测试和 Ubuntu 浏览器回归；`p3-loopback.yml`/`preview-package.yml` 现有，优先扩展现有测试，不搭第二套 CI。
- 新设计方向由 Design Contract v0.2（#64）与 MORPH-02（#66）负责，本文只新增测试/Provider 合同；不要顺便重构悬浮球、主题或窗口权限。

## 2. 免费优先测试矩阵与证据边界

| Gate | 执行环境与实际动作 | PASS 的必要证据 | 限制/兜底 |
|---|---|---|---|
| T0 | 既有 GitHub Actions `windows-latest` / Ubuntu + 合成数据 | 固定 SHA、Windows 编译、便携启动/退出、Store/后端、Playwright、文件哈希、产物清单 | Runner 是短命 VM，无桌面人工交互保证；不能替代本机 GUI |
| T1 | Windows Runner 作为云端发送或接收端 + 本机 Windows / 另一 Runner | 两个**独立 OS 实例**实际传输、双向、SHA256、一文件/三文件、取消/拒收与重启；明示网络拓扑 | GitHub Runner 默认无私有 LAN 直达；公网互联需经审核的安全隧道/中继；两进程 loopback 不算双机 |
| T2 | Cloudflare Quick Tunnel → 合成 HTTP 测试服务 | 独立外网浏览器访问临时 HTTPS 地址，WebSocket/WSS 握手、字节/哈希一致、过期/停止 | 不支持 SSE，无可用性承诺；Quick Tunnel ≠ 原生 croc 多 TCP 端口透传；需单独验证网关适配 |
| T3 | Android Chrome / iPhone Safari（优先远程真机，备选 Android emulator/浏览器引擎） | 实际云设备/真机打开公开 HTTPS、下载、反向选择文件、哈希/取消；分别记录 OS/浏览器 | BrowserStack Live 的文件注入官方要求 Team Pro/Enterprise Pro，试用是否覆盖不保证；上传 UI 与真正远端保存是不同验收 |
| T4 | 两端处于不同网络，经认可 relay/WSS/HTTPS | 跨网双向字节传输、SHA、临时码撤销、掉线处理、无旧文件覆盖 | 不把局域网回环/内网地址显示为公网可用 |
| T5 | LM Studio 本地服务 + 受控 Mock + 经授权 OpenRouter `:free` | 连续三轮、流式回复、停止、重启恢复、Key 不落日志，特定模型真实回复与请求数量 | 无 Key 先运行 Mock/本地；OpenRouter 免费 50/天、20/分，上游变动需复核，失败计次数 |
| T6 | 综合 Windows 便携候选 | 同一源码/EXE：文件收集→互传→AI→关闭重启→恢复，逐项验收矩阵 | 未完成的设备、DPI、多屏、安装升级各自留 NOT_TESTED，不能借历史 SHA 的 PASS |

**关键区分：** `windows-latest` 在公开仓库有标准托管资源，但不能无审批从公网上暴露任意端口。GitHub-hosted Runner 默认可出公网，不能自动当作你的家用 LAN 一员。可通过 WireGuard/正式受控 relay/经审核的 Cloudflare 路径连接；不要依靠 GitHub ephemeral Runner IP 做长期入口。每次测试启动-完成-销毁，避免遗留转发。

参考：<https://docs.github.com/en/actions/reference/runners/github-hosted-runners>；<https://docs.github.com/en/actions/concepts/runners/private-networking>

### 第二 Windows 兜底策略

优先级：①免费 Actions 两端合成互传和不同公网网络节点；②用户已有合法云 Windows/远程桌面环境；③资源允许时创建受控 VM。禁止强行在当前 Win11 Home 启用不受支持的 Sandbox、绕开授权安装 hypervisor、擅自重启宿主。仅云端自动化不等于本地 Explorer/OLE 人工验收。

### 手机兜底策略

第一层：桌面 Playwright Chromium/Firefox/WebKit 进行协议与页面兼容测试（不是实机）。第二层：BrowserStack Live / 其他具备试用资格的真实设备云；检查实际套餐、剩余时长、Local Testing 和文件注入权限，不能默认免费。第三层：Android 官方 Emulator（需足够系统资源）；iOS 真正 Safari 需受控 Apple 环境/远程真机，Windows 浏览器内核模拟不能冒充 iPhone 真机。测试使用小型合成 TXT/PNG 并验证设备实际下载及反向上传路径。

BrowserStack 官方限制：<https://www.browserstack.com/docs/live/media/file-injection>；<https://www.browserstack.com/docs/live/local-testing>

## 3. Cloudflare 公网方案：三阶、可停止、无默认部署

**阶段 C0（最小验证）：** 仅本地临时静态网页/受控 WebSocket 网关（**不得直接暴露 Tauri、SQLite、本地模型或带开发常量的 relay**），用官方固定版本 `cloudflared` 通过短时 Quick Tunnel 输出 trycloudflare HTTPS；默认不保存页面的隐私素材，不加入公共索引/Analytics。记录临时地址、连接与关停时间，避免把测试地址写进永久文档。真实公网部署或对外监听先确认公开范围、安全方案；任何 Key 仅经环境变量/凭据管理，不能提交仓库。

Quick Tunnel 官方：<https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/>。有 200 in-flight 请求上限、不支持 SSE、地址会变、无 uptime 保证；面向浏览器交互需单独测试 WebSocket，不把 `cloudflared tunnel --url http://127.0.0.1:PORT` 的存在等同已证明 croc Relay 兼容。

**阶段 C1（稳定域名/安全网关）：** 有真实访问需求时，先确认用户 Cloudflare 账户、域名归属及计划；选正式 Named Tunnel + 必要的 Access / 访问限制。最小暴露面：只对浏览器网页/WSS 适配网关，源端 127.0.0.1，仅临时文件内容、不可调用 Tauri IPC、不可读任意本地目录。连接码随机生成、短有效期、撤销即失效、速率限制；敏感信息不写 URL query / HTTP 访问日志，尽量沿已审查密码学协议。公开服务成本与运营责任明确后再开启，不默认常驻后台。

**阶段 C2（可选大文件/离线寄存）：** 先保证 P2P/relay 在线分享可用，只有明确需要才加 R2 `Standard`，并且必须用户主动选择“云端临时转存”，对对象有效期、密钥、逐项删除有真实 UI 和后台清理；上传前客户端加密与最小必要元数据，服务端/桶不持有解密密钥。使用可撤销的最小权限签名 URL/分片上传、校验下载哈希；注意 CDN/代理单请求上限与 R2 API/分片上传不同，不能把大文件放在普通代理直接传。R2 有免费额度但超出可能收费、需要确认计费设置，**不能因有免费档就自动启用**。

Cloudflare 参考：<https://developers.cloudflare.com/tunnel/>、<https://developers.cloudflare.com/r2/pricing/>、<https://developers.cloudflare.com/r2/platform/limits/>

### 网络架构红线

目前 croc Debug relay 是本机多 TCP 端口，Cloudflare 公共 HTTP Tunnel 不能不加适配就直接透传所有 croc 原生 TCP 通道。必须先用 WSS 网关或对协议/部署方式做小范围验证（握手、下载、取消、错误码和双向哈希）；跨网测试失败应保留局域网本地收发模式。不将“Cloudflare 开通成功”写成“跨公网文件互传通过”。

## 4. 多厂商 AI Provider：协议优先、同一 UI

### 4.1 最小统一接口（建议职责，不强制类名）

`ProviderProfile { provider_id, protocol, endpoint_base, model_id, auth_mode, capabilities }`；`ChatRequest { session_id, messages, stream, optional_options }`；`ChatEvent { delta_text, done, usage?, error? }`。

在现有 Rust `chat.rs` 后方抽象 **不泄漏文件权限的协议适配器**；聊天历史和 UI 不重建。先做协议校验器，再加可选厂商预设，不为“每家厂商”复制整个请求/会话/存储流程。旧 ChatConfig/API 配置及 DPAPI 必须向后兼容，确需存储迁移时先备份+回滚测试。限制远端 HTTPS、DNS 私网拒绝与 localhost 显式允许，禁跳转、密钥不打印；不同端点不得误把旧厂商的 Key 传过去。

### 4.2 第一批协议 / 厂商门槛

| 类别 | 厂商/实例 | 具体接入策略 |
|---|---|---|
| OpenAI Chat Completions 兼容 | OpenAI、OpenRouter、DeepSeek、Qwen/DashScope、SiliconFlow | 配置推荐 Base URL/模型 ID，测试 `/chat/completions` 兼容情况；厂商差异通过选项隔离，不将“名字在列表”视为 PASS |
| OpenAI-compatible 本地 | LM Studio（`http://127.0.0.1:1234/v1`）、Ollama（若本地启用兼容接口） | 仅 localhost HTTP，显式选择，先读 `/models` 再对话；LM Studio 用户已有可用性需实机确认 |
| Google Gemini | 首选官方 OpenAI-compatible 路线；保留原生 Gemini REST 适配扩展点 | 以当前官方文档和具体模型流事件为准，非完全兼容能力不强行模拟 |
| Anthropic Claude | 原生 Messages API + 专用鉴权/版本头/SSE 解析 | 不得把 Anthropic 原生 endpoint 简单拼 `/chat/completions` 并塞 Bearer 视为已接入 |
| 自定义服务 | 合法 HTTPS OpenAI-compatible | 显式确认服务地址与域名，防 SSRF/DNS rebinding/redirect/Key 跨主机泄漏 |

API 预设 ≠ 验证通过；每个 Provider 记录 `CONFIGURED` / `MOCK_PASS` / `LIVE_PASS` / `NOT_TESTED`。多厂商的最低验收为“OpenAI-compatible 适配各主要厂商合法 endpoint 模型配置+ mock，真实 LM Studio 和 OpenRouter 免费模型至少各一次成功多轮”，Anthropic 原生需独立 mock 协议测试，有合法 Key 才做 live；不强制用户购买所有厂商额度。

参考：<https://lmstudio.ai/docs/developer/openai-compat>、<https://openrouter.ai/collections/free-models/>

### 4.3 免费额度和测试预算

- OpenRouter 免费模型的 `:free` 及 `openrouter/free` 由官方决定实际可用性；常见账号限制 50 请求/天、20 请求/分，**失败请求也可能计数**，版本/账户状态可能变化；每轮真人 API 验收最多先计划 5–10 次，按实际账单/用量核对，不能编写自动循环消耗完额度。
- 先用受控 HTTP/SSE mock 跑 401/403/429/5xx、Malformed SSE、断流、停止/取消、三轮历史、无 Key、错误模型、超时以及重启会话。
- LM Studio 在用户设备本地启动后才接通，不自行下载大型模型或动用 GPU/磁盘超预算；不要让云 Runner 请求本地无鉴权模型服务。
- 真实 Key 通过 Windows DPAPI / GitHub Actions secrets（按对应平台规范）储存；公仓不能把 `.env`、Token、Cloudflare credentials、浏览器截图中的 Secret 或响应原文放入工件。
- 真实模型测试必须能关闭、可明确看到“将访问何厂商/可能计费”，默认不读文件、不自动上传图片/视频，停止不自动重试收费请求。
- ChatGPT Plus/Google AI Pro 等网页会员不等于开发 API 额度。

## 5. 安全门禁与阶段权限

- **G0 现可执行**：纯代码、独立合成文件、mock API、默认 Windows/Ubuntu CI、本地 loopback，日志脱敏和第三方许可核查。用户已授权常规开发、GitHub 测试和技术选型。
- **G1 真实 LAN**：合法双端、接收目录、配对/指纹、打开临时监听范围和防火墙变更分别审查；不得自动开放公网。
- **G2 公网入口**：Cloudflare Tunnel/Access、域名/DNS、公开 relay/网页、网络流量与真实监听；选择最小入口并单独授权实际部署，不因用户有 Dashboard 账户就代改生产 DNS。
- **G3 云手机/云电脑付费能力**：先确认当前免费试用确实覆盖需要的真实下载/文件注入与运行分钟；未知成本不创建账单资源。
- **G4 模型/云存储费用**：实际使用 OpenRouter 免费 Key 前确认 Key 已由用户在本机/安全渠道配置；先确认选中 `:free`，无自动付费升级；R2 创建前确认计划、权限、对象生命周期与费用上限。

对每个需要用户介入的关卡，仅集中提出一次最小问题；其余不依赖授权的开发继续。不得索要用户把私人 Token 贴进 PR 或聊天。

## 6. 连续实施任务 / 允许暂停的条件

按以下顺序实际实施并逐步进入 #62 主集成候选（或者其经过审阅后确定的新基线）：

1. **S1 先收束可运行候选**：核对 `#62` 最新 HEAD 和 `ACTIVE-DELIVERY.md`，核查 r7 的浏览器组件许可/sidecar 相对路径、SHA、构建可移植性与 Debug-only 开关；保留旧包。复测同一 EXE 的“桌面选择→浏览器下载 SHA→取消→任务终态→退出清理”。
2. **T0/T1 零额外费测试切片**：复用既有 GitHub Actions，最小 Windows Runner 合成文件双进程/独立主机网络探测；检查上传工件脱敏和留存；若无公网安全接入，仅记录 `T1 = NOT_TESTED`，不能说“没有第二台真实 Windows 就完全无进展”。
3. **AI mock + LM Studio 优先**：分离兼容/原生 Provider，保证老数据无损，跑三轮和错误矩阵；再在用户本地明确启用 LM 服务后做合法 live。OpenRouter 免费限额内仅在用户安全配置 Key 后执行有限请求。
4. **Cloudflare C0 受控准备**：先写本地只绑定 loopback 的合成 WebSocket 网关与启动/停止检查、失败关停和连接码方案；只有实际 G2 放行才开 Quick Tunnel；测试 HTTP/WSS/取消、不能用仅页面 200 冒充完成。
5. **Android/iOS + 跨网**：先 browser engines，再按 BrowserStack 试用能力使用真机，明确文件注入可能需要付费；用不同网络/独立设备证明 SHA/重名/断线、保留原件和双向收发。
6. **正式产品与可选 R2**：仅需时试用 Named Tunnel / Access / R2，用户确认费用、域名和实际部署后启用；完成许可证、数据保护、卸载、备份和回滚。

每个阶段结束立刻更新唯一 `ACTIVE-DELIVERY.md`，附 exact SHA、build SHA、Windows EXE hash、CI 链接、设备/OS/公网拓扑、PASS/FAIL/PARTIAL/NOT_TESTED、费用、回滚，直接接续下一阶段；不可将文档计划或云环境可以注册写为已测试。

## 7. 固定最低完成标准（Definition of Done）

- 在不同 Windows 实例真正传输普通 TXT/PNG，单个与批次均 SHA256 一致，双方任务终态正确；**局域网双机与公网两端分别验收**。
- 浏览器 Android/iOS 的实际访问与下载、反向发回分别验收；不可用套餐或设备明确标记未测，不靠浏览器缩放截图冒充。
- Cloudflare 公网模式只有真实 HTTPS/WSS+经过验证的 relay/bridge 数据路径才 PASS；服务关闭后不可再访问，邀请码失效，日志无秘密。
- AI 支持至少一套本地兼容模型、一套受控云端免费模型与 Anthropic 类不同原生协议 mock，聊天连续三轮，停止/重启历史/失败状态正确，Key 和用户文件安全。
- 所有相关代码、测试、资源清单、版权/许可证、权限审计、可回滚候选基线都能在一个主要集成链找到。未通过的门槛继续留在任务清单，不以 85% UI 容忍度跳过文件安全/隐私/费用。

## 8. 新工具和下载准则

优先复用已有 Rust、TypeScript、Playwright、GitHub Actions、croc、Windows 原生 CLI 和用户已有 LM Studio。`cloudflared`、BrowserStack Local、官方 Android Emulator 或跨平台测试 CLI **仅有明确验证必要时**从官方来源获取，锁定版本及 SHA，隔离数据与路径；检查许可证、系统资源、费用与是否需管理员权限。不要再引入大 Agent、虚拟机管理平台或另一套任务数据库。

## 9. 下一轮 Codex 汇报格式

| Gate | 源码/包 SHA | 测试环境 | 结果 | 字节/交互证据 | 当前阻塞/下一动作 |
|---|---|---|---|---|---|
| T0 | | | | | |
| T1 LAN 双端 | | | | | |
| T2 HTTPS/WSS | | | | | |
| T3 Android/iOS | | | | | |
| T4 不同网络 | | | | | |
| T5 AI 本地/云/原生 mock | | | | | |
| T6 完整候选 | | | | | |

以可运行的用户闭环作为最高优先级，不用增加 PR 数量或研究文档数量替代。
