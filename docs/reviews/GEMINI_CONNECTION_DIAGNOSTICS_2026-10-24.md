# Gemini 官方 CLI 紧急排障核查（2026-10-24）

关联 [Issue #17](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/17)。本轮继续使用旧项目已成功的官方 CLI 流程，不重装、不建网关，不修改文件安全 PR。

**当前结果：网络差异与实际审批状态已核实；Gemini 真实响应和首轮审查尚未恢复。用户已将界面改为 Ask for approval，但当前运行轮次仍记录旧的 never，等待下一轮加载。模型请求为 0。**

## 1. 旧环境成功的关键条件

已核对旧项目 [PR #22](https://github.com/2539426035852ningmao-cmyk/modular-workstation/pull/22)、[GEMINI.md](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/GEMINI.md)、[工作流](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/docs/AI_REVIEW_WORKFLOW.md)、[S0-03 报告](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/docs/reviews/S0_03_REVIEW_2026-10-20.md)、[元数据](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/docs/reviews/s0-03-review-metadata.json)，并回溯本机“个人工作站”原对话及实际流式结果。

- 2026-10-20 原对话确实先出现 Google 授权服务器超时，改用现有代理后，用户本人完成一次官方授权，客户端识别 Google AI Pro；随后取得非空 REVIEW_READY 和完整独立审查。
- 实际成功命令通过 GetSystemWebProxy 解析当时系统代理，再设置 CLI 进程 HTTP_PROXY / HTTPS_PROXY。旧记录没有保留该动态返回值的确切端口，不能把今天端口当成历史事实。
- 旧客户端 1.4.3，官方签名有效；plan + stream-json，固定公开源码的带行号文本直接输入，不依赖模型文件工具、shell 或写入权限。
- 基线 8bfff562e4cc0edce68f27b7446f87be969de25b，19 文件；最终 SUCCESS、正文 9,591 字符、144.8803954 秒、stderr 0 字节、零工具步骤。前两次空正文没有计成功。
- 2026-10-21/22 后续成功审查也显式设置进程代理并限定超时。Google AI Pro 和额外点数 off 是历史已确认状态，不能继承为今天通过。

没有读取或复用历史授权码。找到历史安装脚本、输入/输出和元数据，但未找到持久保存的审查启动脚本；本轮没有运行安装脚本或删除旧环境。

## 2. 现在与旧环境的差异

| 项目 | 旧成功证据 | 当前核查 |
| --- | --- | --- |
| 客户端 | 1.4.3 | 最新实际 --version 为 **1.4.6**，--help 成功；1.4.4 是此前 Gate A 版本 |
| 文件签名 | Google LLC 有效 | 当前 Google LLC / Valid |
| 代理继承 | 成功命令显式设置进程变量 | Codex 父进程未设置 HTTP_PROXY / HTTPS_PROXY；不代表其他终端/既有 CLI 也没有设置 |
| Windows 代理 | 成功命令动态读取系统代理 | WinINET 启用现有 HTTP 代理；WinHTTP 为 Direct；两者不一致 |
| 本地代理 | 旧解析结果未持久记录端口 | 当前监听及 verge-mihomo 进程存在，HTTP 协议经实际 CONNECT/TLS 验证可用；具体本地地址不公开归档 |
| 既有 agy 网络 | 不适用 | 观察到 4 条到已知本地代理的 TCP 记录，不能声称其完全未走代理 |
| 账号与费用 | 旧客户端曾确认 Pro、credits off | 当前未得到官方客户端登录成功、Pro/额度及 off/Never 的证据 |
| Codex 审批 | 当时允许命令完成 | 当前轮次实测 Full Access + never，reviewer=user |

当前磁盘文件 204,022,936 字节，SHA256 A6A1A638CBF4874B31B683D728D9343EE71BD30077934D2448EEA881264E1250。此前 Gate A 文件为 202,906,776 字节，SHA256 D4354765881F384E9229978AF37F89D26AF9E13A2BD81DEF4B2892B42B8BE38C。变化原因未确定，本轮没有安装、更新或替换 CLI。没有操作或结束既有 agy 进程。

用户提供的页面先显示官方授权码，终端截图则明确显示未登录并停在 Google OAuth 选择处；浏览器完成授权不能写成 CLI 登录成功。

## 3. Codex blocked by policy：已证明和未证明

对当前会话的真实 turn_context 作只读白名单提取，最近记录一致为：

~~~json
{
  "approval_policy": "never",
  "approvals_reviewer": "user",
  "sandbox_policy": { "type": "danger-full-access" },
  "permission_profile": { "type": "disabled" }
}
~~~

部分记录还包含 active_permission_profile.id=:danger-full-access。当前安装的 Codex 包为 26.1016.8622.0。没有仅凭全局 config.toml 推断实际生效状态，也没有修改该文件。

实际工具输出确认 **3 次**执行前拒绝：
1. 只读 agy models 启动；
2. 附带仅限子进程 HTTP_PROXY / HTTPS_PROXY 的 models 启动；
3. 附带该进程代理的 Start-Process 官方交互登录窗口启动（--mode=plan，无模型 prompt）。

三次都在 CreateProcess 阶段返回 Rejected / blocked by policy；目标命令内的检查、设置与客户端子进程均未实际执行。未显示具体命中规则、规则来源或风险理由。

**更正此前归因：没有证据证明这是自动审查员作出的拒绝。** 当前 reviewer=user，不能把笼统错误称为 auto_review 拒绝。局部 default.rules 有 9 行，未匹配到 agy/Antigravity/启动器专门规则；这不排除其他执行层规则。

[官方审批文档](https://learn.chatgpt.com/docs/sandboxing) 说明 Full Access 对应 danger-full-access + never；never 不提供批准提示，而 on-request 支持在需要时请求批准。因此，**当前不能弹出审批的原因已核实，具体为何拒绝该命令仍未查明**。

用户提供的 [上游 #52543](https://github.com/openai/codex/issues/52543) 报告同类 Windows 启动拒绝，并记录改为 on-request 后成功；[#54610](https://github.com/openai/codex/issues/54610) 也明确提醒不能误归因为自动审查。它们是原始反馈，版本和操作不同，不证明本机必然是同一个缺陷。

用户本轮已明确把当前任务界面改为 **Ask for approval / 请求批准**。随后只读核对仍显示本运行轮次的旧 turn_context：2026-10-23 20:23:40 UTC / never / reviewer=user。没有在旧状态重试被拒绝命令，没有改变全局策略、编码命令、改入口或借其他执行工具绕过。下一正常轮次需先核对 on-request 是否生效，再通过官方审批申请同一必要动作；若仍是 never，则继续如实记录，不能假装审批已获准。

## 4. Google OAuth 超时：网络实测

全部测试不携带授权码、Cookie、token 或账号数据，不保存响应正文、不关闭 TLS 校验。

| 检查 | 实际结果 |
| --- | --- |
| DNS | oauth2.googleapis.com 的 A 记录解析成功 |
| WinINET | 现有代理启用，PAC 未配置 |
| WinHTTP | Direct access / no proxy |
| 本地代理 | 已知 HTTP 端口在监听，进程 verge-mihomo |
| 显式直连 GET 同一 token 端点 | curl exit 28，HTTP 000，约 6.002 秒 TCP 连接超时，TLS 未建立 |
| 显式现有代理 GET | curl exit 0，HTTP 404；TCP 0.001 秒、TLS 0.611 秒、总计 0.829 秒，证书验证结果 0 |
| 代理日志关联 | 2026-10-24 04:27:12 香港时间的目标域名/测试连接端口与上述 curl 匹配，记录使用代理链，无错误标记 |
| 既有 agy 连接 | 4 条到已知代理的 TCP 记录；无法据此认定具体 token 请求已成功 |
| 本机拦截事件 | 最近一小时 Windows Filtering Platform 5157 / Defender ASR 1121 查询无匹配事件；不是完整排除第三方网络安全软件的证据 |

HTTP 404 是无凭据 GET 的响应，证明正确代理路径能够建立 HTTPS，**不是 token 交换或登录成功**。此前一次对照也为直连超时、代理 HTTPS 可达，结果一致。

已证明直连路径存在可达性问题、现有代理路径可用。尚未证明客户端失败的唯一根因；当前已有 agy 到代理的连接，因此不能将父进程环境变量缺失扩大为“所有客户端都直连”。没有读取既有进程环境/内存/命令行，也没有携带授权码重复登录来试错。

社区资料的边界：[LINUX DO 原帖](https://linux.do/t/topic/2967484) 在 2026-10-21 更正了“开不开 TUN 都一样”的旧判断；不同回复也有失败案例。[Google 社区讨论](https://discuss.ai.google.dev/t/gemini-code-assist-antigravity-authentication-error-browser-auth-succeeds-but-client-fails-token-exchange-timeout-eligibility-mismatch/185670) 区分浏览器授权与客户端 token 请求，但不能把其中全局改代理/暂停安全软件建议直接用于本机。本轮没有启用 TUN、提权、修改系统代理或暂停安全软件。

[Antigravity #181](https://github.com/google-antigravity/antigravity-cli/issues/181) 与 [#523](https://github.com/google-antigravity/antigravity-cli/issues/523) 的平台/版本不完全相同，仅为线索；本机测量优先。

## 5. 最小修复、审批与回滚

- 复用旧流程的系统代理解析和进程级 HTTP_PROXY / HTTPS_PROXY；已用无凭据网络对照证明该路径可达，但被拒绝的 CLI 启动中这些设置并未运行，不能宣称 CLI 修复成功。
- 已更正“自动审查员拒绝”的无证据归因，以及“父进程无代理等于既有 CLI 无代理”的过度推断。
- 用户仅将本任务的权限界面改成 Ask for approval；本轮尚未加载新模式。未改 config.toml、全局 PATH、系统代理、账号权限或批准规则。
- 终端操作不再交给用户。下一轮权限生效后，由 Codex 申请正式批准并准备官方登录窗口；用户只在必要时本人完成一次官方授权。
- 网络检查没有持久写入配置，无需回滚系统网络；文档可 revert 本 PR。保留旧客户端、脚本、授权记录和用户文件，不撤销账号、不删除凭据。任务权限模式由用户通过界面选择，不由代理自行改安全策略。

## 6. 真实响应是否恢复

**未恢复。** 当前官方登录、Google AI Pro/剩余额度、自动额外点数 off / Overages Never 均未确认，Gate B 未执行，模型请求 0 次。

只读查看的非凭据 settings.json 当前没有显式 useG1Credits；默认值或历史 off 不能代替当前客户端实查。[官方 Credits 说明](https://antigravity.google/docs/cli/credits/) 与[计划页](https://antigravity.google/docs/plans) 仍要求区分订阅额度和额外 credits。

后续仅通过[官方 OAuth](https://antigravity.google/docs/install?tab=cli)；授权码只由用户输入官方安全位置，不发送聊天。费用明确关闭后才执行一次有限超时 JSON 健康探针，同时要求退出码、SUCCESS、非空且准确的 REVIEW_READY、无工具/权限/计费异常；失败停止，不循环调用。

## 7. 首轮独立审查是否成功

**未执行，不能宣称成功。** #9/#11/#13 与业务代码未改动。

审批、网络、账号及费用门槛全部满足后，再固定三 PR 的实际 head/base SHA；Codex 先保存独立判断，Gemini 只读取不包含这些判断的公开行号文本快照，沿用 plan、当前实际可用模型、匹配 effort 和有限超时，不授予 shell 或文件写入权限。空白目录和 plan 本身不等于强制只读，仍需核对生效权限/插件/MCP/hooks。

取得有效审查后由 Codex 逐条复现、采纳/误报/争议裁决；Windows 原生 Copy 拖入拖出、内部排序、SQLite/复制异常及安装/DPI 等未测项单独保留。当前仓库文档 CI 只能证明仓库检查通过，不代表登录、模型或 Windows 实机验收通过。
