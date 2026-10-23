# Gemini 官方 CLI 连接排障记录（2026-10-24）

关联 [Issue #17](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/17)。本轮沿用 modular-workstation 已成功的官方 CLI 流程，没有设计新的模型网关。

**状态：网络差异已复现，官方客户端启动受执行策略阻塞；Gate A 尚未放行，Gate B/C 未执行，模型请求 0 次。**

## 历史成功证据

已读取旧项目 [PR #22](https://github.com/2539426035852ningmao-cmyk/modular-workstation/pull/22)、[AI_REVIEW_WORKFLOW.md](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/docs/AI_REVIEW_WORKFLOW.md)、[GEMINI.md](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/GEMINI.md)、[S0-03 审查与裁决](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/docs/reviews/S0_03_REVIEW_2026-10-20.md)、[模型网关评估归档](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/docs/MODEL_GATEWAY_POC_2026-10-21.md)，并与旧工作目录的元数据及实际输出流交叉核对。

历史 S0-03：基线 8bfff562e4cc0edce68f27b7446f87be969de25b，官方 CLI 1.4.3，客户端识别 Google AI Pro，Gemini 3.8 Flash (High)，plan + stream-json，公开 19 文件行号快照直接输入，零工具步骤。实际最终事件 status=SUCCESS、正文 9,591 字符、耗时 144.8803954 秒、stderr 文件为 0 字节。前两次权限拒绝且正文为空未计成功。

后续成功记录还明确采用进程级 HTTP_PROXY / HTTPS_PROXY，并先用 agy models 核对模型 ID，再以匹配的 effort 执行有限超时请求。可复用的是官方客户端、纯文本快照和权限边界；历史账号、模型与费用状态不能继承为今天已验证。

本机找到历史安装脚本和实际流式输出；定向检索没有找到持久保存的审查启动脚本，不把文档中的命令冒称为已找到的本地脚本。安装脚本没有运行。网关 PoC 的归档明确未启动第三方个人 OAuth 转发；本轮也不采用该路径。

## 当前网络对照

用户报告当前官方 OAuth 在向 oauth2.googleapis.com/token 建立 HTTPS 连接时 TCP 443 超时。核查发现：

- Windows 已有系统 HTTP 代理启用，本地监听存在。
- 当前进程以及读取的 User/Machine 范围均未发现 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY、NO_PROXY 值；这与旧成功记录的显式进程代理有差异。
- 不修改任何代理配置，通过现有代理和直连分别对同一公开端点做无凭据 GET；关闭响应正文保存，没有登录请求、授权码、Cookie 或 token。

| 路径 | curl 退出码 | HTTP | TCP/TLS 与时间 |
| --- | ---: | ---: | --- |
| 显式直连 | 28 | 000 | 6.009 秒连接超时，未完成 TLS |
| 显式使用现有本地代理 | 0 | 404 | TCP 0.001 秒、TLS 1.787 秒、总计 2.001 秒；证书校验结果 0 |

404 是本次无凭据 GET 的实际响应，证明该路径能够取得 HTTPS 响应，**不证明 OAuth token 交换成功**。没有使用禁用证书校验选项。

判断：已复现直连与代理路由的可达性差异，缺少 CLI 进程代理是应优先核验的原因。不能仅凭上述 curl 测试断言 CLI 一定采用相同传输栈，也不能据超时认定账号、会员或额度异常。没有改变全局代理、TUN、PATH 或系统权限。

[上游代理反馈 #181](https://github.com/google-antigravity/antigravity-cli/issues/181) 也记录了部分认证后客户端可能忽略代理变量，但其环境与版本不同，仅作线索；本机实际结果优先，不能照搬其结论。

## 当前 CLI 与执行阻碍

此前 Gate A 已实际确认既有 Google 官方 agy.exe 1.4.4、Google LLC Authenticode 签名 Valid，帮助支持 JSON / stream-json、plan 和显式 print-timeout。没有安装、更新或替换二进制。

本轮尝试从空白隔离目录，以仅作用于该子进程的 HTTP_PROXY / HTTPS_PROXY 启动 **agy models**。请求在进程启动前被自动审批审查拒绝，返回仅为 **blocked by policy**，没有更细说明。因此：

- 不能获得本次 CLI 退出码，也没有 Google 返回的认证报错。
- 没有运行该子进程、没有触发其 OAuth 流程，也不能声称进程代理已经修复 CLI。
- 已停止 CLI 启动尝试，没有换工具、换入口、包装脚本、修改权限或其他绕过。
- 无法判断策略究竟针对哪一项行为；不猜测是 Google、杀毒软件或 Windows 防火墙拦截。

安全处理是不重复运行被拒绝的客户端操作，也不改用模型 prompt 探测登录。需执行环境明确允许官方客户端检查后才能恢复后续依赖步骤。

## 账号与费用门槛

| 门槛 | 当前结论 |
| --- | --- |
| 官方客户端当前登录是否有效 | UNKNOWN；用户报告失效/未登录，尚无本轮客户端验证 |
| 当前 Google AI Pro 识别与剩余额度 | UNKNOWN |
| 当前自动额外 AI Credits 是否关闭 | UNKNOWN |
| 当前账号支持的模型列表 | UNKNOWN |
| 最小 REVIEW_READY 有效响应 | 未执行 |
| #9/#11/#13 独立 Gemini 审查 | 未执行 |

只对白名单非凭据 settings.json 字段进行了只读检查：文件当前仅包含 trustedWorkspaces 设置，useG1Credits 未显式设置；没有读取可信目录的具体值。未显式设置**不是**当前客户端已确认 off 的证据，没有修改该文件。

[官方 Credits 说明](https://antigravity.google/docs/cli/credits/) 说明通过 /config 或 /settings 查看 Use G1 Credits；[计划页](https://antigravity.google/docs/plans) 将自动超额使用区分为 Never / Always。须取得实际客户端 off / Never 证据后才能发送模型请求。不能仅从默认 false 或旧记录 off 推断今天已关闭。

[官方认证文档](https://antigravity.google/docs/install/) 支持客户端自行完成账号授权。必要时用户本人在官方浏览器/客户端操作，不把授权码发到聊天，不由 Codex 读取或导出凭据。当前没有启动登录窗口，也不要求用户立即操作。

## 恢复后沿用的流程

保持既有 Gate A → B → C：

1. 在执行环境允许后复验现有进程级代理，不更改全局代理；官方客户端恢复授权，用户本人完成必要 OAuth。
2. 明确客户端 Google AI Pro、剩余额度、自动额外点数 off / Never、实际模型列表和有效工具权限。
3. 空白隔离目录执行一次最小化 headless JSON；同时要求退出码、SUCCESS、非空且准确的 REVIEW_READY、无计费/认证/权限异常。失败即停止，不循环重试。
4. 固定 #9 → #11 → #13 的实际 SHA，Codex 先独立记录疑点，再只向 Gemini 提供不含这些结论的公开源码文本。沿用 plan、固定模型及匹配 effort、有限超时、零文件/shell 工具授权。
5. 空白目录和 plan 本身不等于强制只读；审查前仍须核对实际权限、插件/MCP/hooks，不将工作仓库作为 Gemini 的可写工作区。
6. 保存脱敏模型报告与 Codex 逐项裁决；真实 Windows 拖入拖出 Copy、内部排序、SQLite/复制安全、安装和 DPI 等未测项继续独立标记。

## 本轮边界与回滚

仅新增本记录，更新 Issue #17；不修改业务代码、#9/#11/#13、CLI 设置或全局网络。没有读取 Token、Cookie、密码或 OAuth 缓存，没有创建 API Key/Google Cloud 计费项目，没有第三方 OAuth 转发，没有跳过权限参数。

网络测试没有持久配置变化；文档可通过 revert 本 PR 回滚。原有凭据、CLI、用户文件和数据库不删除。Gate A/B/C 保持未完成；本次文档 CI 只检查仓库内容，不代表官方客户端或 Gemini 已通过。
