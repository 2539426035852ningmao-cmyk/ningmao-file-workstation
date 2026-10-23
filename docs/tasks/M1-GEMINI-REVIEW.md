# M1-GEMINI-REVIEW · 官方 Gemini 独立审查接入

> 状态：**流程与入口已准备，等待 Windows 本地真实健康检查**
> 不代表 Gemini 已对柠猫文件工作站源码进行过审查

## 任务目标

复用模块化个人工作站 [PR #22](https://github.com/2539426035852ningmao-cmyk/modular-workstation/pull/22) 的已验证方法，在本仓库对独立 Tauri 文件操作候选完成第一轮**只读、无新增 API 费用**的交叉审查。

## 当前已完成的准备

- [x] 核查历史已合并的双 AI 审查文档及局限
- [x] 固定职责：Codex 开发/执行/验证，Gemini 独立只读审查，用户/ChatGPT 审议结果
- [x] 准备根目录 `GEMINI.md` 与 `docs/AI_REVIEW_WORKFLOW.md`
- [x] 明确费用、隐私、权限及停止规则
- [x] 设计第一轮审查目标：#9 → #11 → #13

## 尚未执行

- [ ] **Gate A**：Windows 上检查官方 `agy.exe`、签名、版本、模型列表、官方账号状态及关闭自动额外点数
- [ ] **Gate B**：使用已有订阅执行一次最小化响应测试，确认 SUCCESS + 正文非空且正确；不以 0 退出码单独判断
- [ ] **Gate C**：固定三个 PR 的实际 SHA，筛选公开源码快照，Gemini 独立审查并返回有文件行号的报告
- [ ] Codex 逐条复核并说明证据、误报、未测试、需用户确认的高风险点
- [ ] 将脱敏审查元数据、报告、裁决用独立 PR 提交，用户再决定是否批准后续修复

## 本轮不做

- 不安装新模型网关、不提取浏览器 Cookie 或 OAuth 文件、不配置第三方认证代理
- 不申请 Gemini API Key、不开通新的付费 API 或 Google Cloud 账单
- 不修改 CLI 全局权限或允许自动额外 AI 点数
- 不更改用户真实素材或真实数据库，不自动合并文件安全候选
- 不用 Gemini 静态审查代替实际 Windows GUI / Installer 验收

## 报告要求

Codex 应记录真实 CLI 路径是否存在、签名/版本、是否需要重新登录、额度设置是否确证、所见错误和处理建议。不上传任何账号 ID、令牌、授权会话、私人路径。状态以新证据更新，不能仅从历史成功推断当下通过。

后续目标通过 [docs/AI_REVIEW_WORKFLOW.md](../AI_REVIEW_WORKFLOW.md) 的 Gate A/B/C 实施。
