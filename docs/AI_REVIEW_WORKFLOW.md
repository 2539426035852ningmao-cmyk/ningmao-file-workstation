# 第一轮双 AI 独立复核 · 可重复执行协议

> 状态：接入与健康检查**待真实 Windows Codex 执行**
> 适用：柠猫文件工作站 M1-05 / M1-06，GitHub PR #9、#11、#13
> 用户约束：优先使用现有 Google AI Pro 权益，不开通 Gemini API 付费，不启用自动额外 AI 点数

## 角色和信任边界

- **ChatGPT / 用户**：明确任务目标、审查关卡、冲突裁决和最终体验验收；本聊天不直接持有本地 CLI 进程
- **Windows 本地 Codex**：核验环境、固定源码快照、启动官方 CLI、保存脱敏审查报告、验证发现、提交独立 PR
- **Gemini via 官方 Antigravity CLI**：对提供的源码独立只读静态审查，不与 Codex 同时修改代码
- **GitHub CI**：执行可重复检查；无 Windows 人工交互能力的检查不能冒充 GUI/安装验收

历史可复用来源：
[模块化个人工作站 PR #22](https://github.com/2539426035852ningmao-cmyk/modular-workstation/pull/22)、
[已实测的双 AI 流程](https://github.com/2539426035852ningmao-cmyk/modular-workstation/blob/main/docs/AI_REVIEW_WORKFLOW.md)。
其成功记录只证明**历史环境**，本仓库必须重新验证，不能继承认证或成功状态。

## Gate A：只读本机检查（不触发模型）

在 Windows 本地 Codex 的隔离工作目录执行，不干扰用户正在使用的桌面：

1. 只读确认旧 Antigravity CLI 是否仍存在。历史记录：`modular-workstation` 仓库上两级的 `outputs/antigravity-cli-tools/agy.exe`。先从已存在仓库位置解析，不假定磁盘固定盘符；无法定位时仅报告路径缺失
2. 读取实际 `agy --version`、`agy --help` 和 `agy models` 的公开非敏感信息；按当前 CLI 帮助修正参数
3. 校验文件签名/官方来源；发现异常、签名不可信或版本不兼容时中止，未经用户批准不重装、不下载替代来源
4. 不查看、复制或上传令牌、会话 Cookie、OAuth 缓存内容，也不强制刷新登录；仅通过 CLI 官方的账号状态、报错信息判断是否可用
5. 通过实际客户端设置确认自动额外点数（如 `Use AI Credits` 或 Overages）已经关闭；如不可核实，不进入 Gate B，明确要求用户本人查看
6. 不创建 API Key、Cloud 结算账号、第三方中转代理；不要修改全局 PATH/代理/环境永久设置
7. 报告 Gate A 的核验事实及缺口，**不要谎称本轮已成功调用 Gemini**

## Gate B：官方 CLI 最小化健康响应

**仅在 Gate A 已明确确认无新增计费设置并具备可用的官方授权后调用一次。**

1. 在无项目工具权限的隔离目录工作，优先执行 CLI 官方 headless `-p` + `--output-format json`，例如：`agy -p "Reply exactly REVIEW_READY" --output-format json --print-timeout 2m`
2. 可选 `--mode=plan` 仅在**当前** `agy --help` 确认仍支持时使用；不硬编码 2026-10-20 的模型 slug，若需指定模型先 `agy models` 核对
3. 以 CLI 实际路径调用，不先给第三方客户端导出任何令牌；不使用 `--dangerously-skip-permissions`，不赋予 shell/文件写入宽权限
4. 同时检查进程退出码、JSON 状态 `SUCCESS`、`response` 非空且确实是 `REVIEW_READY`、stderr 无认证/权限/计费失败；至少记录客户端版本、当前模型（如可见）、运行时间与无敏感元数据
5. **返回码 0 或 JSON status=SUCCESS 不足以证明通过**；历史上出现过权限拒绝且最终正文为空的假阳性
6. 请求超时、账户失效、额度耗尽、额外点数可能收费或客户端误用时**停止**，不得重复请求直到成功
7. 仅保存**脱敏**结果到仓库外目录；不得将原始会话标识、Google 账号信息、个人路径、日志中的 token 上传公开 GitHub

Gate B 通过后才标记“独立审查通道已可用”；不能把这称为代码审查或动态测试已经完成。

## Gate C：冻结源码、独立审查

只有 Gate B 通过且用户允许消耗**已有订阅额度**时启动：

1. Codex 查询实时 PR #9 → #11 → #13，固定每个 head SHA、base SHA、堆叠层级、CI 状态
2. Codex 在仓库外构造**只含公开已授权源码**的 UTF-8 文本快照：精确文件路径、行号、内容哈希及固定提交，先用 Git 基础规则过滤私人素材、数据库、凭据和构建产物。多模块分段，避免超时和大输入
3. **Codex 先独立写出**自己认为的重点风险与测试缺口，再把**不含自己结论**的源码快照与任务说明交给 Gemini
4. Gemini 仅读取静态文本，不授予工具调用/写文件权限；输出依据、严重度、可复现问题、未看到的范围和修复建议
5. 只接受非空有效结果；保存经过脱敏处理的原文、输入哈希、真实模型、运行状态、耗用量（如 CLI 提供）与对应精确源码版本
6. Codex 再逐项验证，区分：采纳、需测试、误报、争议、无法验证；不得以两模型意见一致替代测试
7. 将报告和裁决经单独 docs/reviews PR 提交给用户；不要自动合并 #9/#11/#13，也不把静态审查当作 Windows 真实拖放/安装通过
8. 用户批准后，才按既定分支安全规则推进实际修复和后续审查

## 第一轮需要特别审查的场景

- 从文件架拖向 Windows Explorer：必须是 **Copy**，来源保留，不得偷换为 Move
- 从 Explorer 拖入、内部 dnd-kit Pointer 排序：原生接收是否与内部拖拽竞争事件
- 临时文件架仅存引用，绑定目录安全复制且冲突自动编号
- 复制取消、重启、异常退出、NTFS ACL 拒绝、长 Unicode 路径、源路径丢失
- SQLite 数据一致性、引用身份/标签/手动顺序保留
- 双击默认应用打开与 Space 预览契约，避免误触发危险操作
- UI 紧凑化不改变 Tauri 权限、Rust 复制函数、SQLite schema 与文件删除规则
- #9、#11、#13 各精确构建证据不可跨二进制继承

## 验收和停机条件

| 阶段 | 可验证结果 | 不能宣称 |
| --- | --- | --- |
| A | CLI 实际路径、签名、版本、当前帮助、账号/费用设置可确认 | Gemini 已成功答复 |
| B | 一次非空、正确的官方 CLI JSON 响应，额外付费已关 | 代码问题已解决 |
| C | 固定 SHA 的独立意见、可核对报告、Codex 逐条裁决 | Windows GUI 自动或人工验收通过 |
| D（未来） | 基于 C 的具体测试/修复和真实 Windows 验收 | 无条件安全认证 |

任一条件缺失即停止**依赖该条件**的步骤，保留历史报告、不销毁旧凭据、不调整权限以绕过检查。

本项目暂不建设永久驻留、每提交无限循环的 Gemini 云端机器人，也不将个人 Google OAuth 包装为第三方 API。后续若要自动 PR 复审，须单独确认官方能力、费用、账户条款、速率限制与安全边界。

## 官方入口与注意

- [Antigravity CLI Headless 模式](https://antigravity.google/docs/cli/headless/)
- [Antigravity CLI 迁移指南](https://antigravity.google/docs/cli/gcli-migration/)
- [Antigravity 计划与费用](https://antigravity.google/docs/plans)
- [Antigravity 服务条款](https://www.antigravity.google/terms)

如 CLI 参数、官方政策与本文冲突，以实际当前帮助及官方文本为准，停止并记录变更。
