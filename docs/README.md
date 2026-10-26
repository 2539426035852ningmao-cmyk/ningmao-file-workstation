# 柠猫文件工作站 · 文档导航

> 本页是文档目录，不代表功能实现或最新 Windows 原生状态。**先看 [项目状态页](project-status.md)，再看源码和 PR。**

## 推荐从这里开始

| 你要做什么 | 正确入口 |
|---|---|
| 第一次认识柠猫 | [仓库首页](../README.md) · [产品说明](../PRODUCT.md) |
| 当前做到哪里 / 哪些功能已验证 | **[项目现状与可视化架构](project-status.md)** |
| Codex 测试/构建提速与 DevLab-C | **[DevLab-C 审计结果、CI 耗时与阶段实施合同](execution/DevLab-C-codex-automation-and-fast-ci-2026-10-26.md)** |
| Codex 接管或继续修复 P2 | **[Codex 最新开工入口](codex-start-here.md)** · [P2→P3→P4 顺序交付合同](execution/P2-to-P3-P4-sequential-delivery-2026-10-26.md) |
| 查主要产品设计 | [`design.md` 全局设计规范](../design.md) · [阶段路线](roadmap.md) |
| 查冻结需求 | [原 43 项](product-decisions.md) · [P4 新增 44 项](product/P4-confirmed-decisions-01-44-2026-10-26.md) |
| 首个公开 Windows Preview 的发布范围和安全门槛 | **[D-01 已确认：分阶段发布](product/D01-windows-preview-release-policy-2026-10-26.md)** · [Issue #43](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/43) |
| 找出哪里需要实测/用户细化 | **[未决项与验证登记簿](open-decisions.md)** |
| P3 首版发送什么文件 | **[D-02 已确认：单文件 + 多文件批量，文件夹递归后置](product/D02-p3-file-batch-first-scope-2026-10-26.md)** · [Issue #43](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/43) |
| 准备 P3 LAN | [免费/克制 UI 合同](design/P3-free-first-lean-ux-contract-2026-10-26.md) · [复用研究](research/P3-P4-open-source-reuse-2026-10-26.md) |
| P4 搜索结果中正文与路径怎样显示 | **[D-03 已确认：轻量结果 + 按需展开](product/D03-p4-search-result-privacy-2026-10-26.md)** · [Issue #43](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/43) |
| 第三方插件何时开放原生系统能力 | **[D-04 已确认：分阶段开放，原生高权限独立审核](product/D04-native-plugin-staged-approval-2026-10-26.md)**（继承 P4 29–39） |
| 准备 P4 检索/AI/插件 | [P4 44 项](product/P4-confirmed-decisions-01-44-2026-10-26.md) · [Gate 0–4](execution/P3-P4-implementation-gates-2026-10-26.md) |
| 双 AI 独立复核 | [审查协议](AI_REVIEW_WORKFLOW.md) · [Gemini 接入任务](tasks/M1-GEMINI-REVIEW.md) · [`GEMINI.md`](../GEMINI.md) |
| 第三方许可证 | [第三方清单](third-party.md) |

## 历史里程碑（保留，不再作为当前开工快照）

- [M1 原始执行基线](m1-execution-baseline.md) · [M1 开发记录](milestones/M1.md)
- [M1-01](tasks/M1-01.md)：公开仓库与基础治理
- [M1-02](tasks/M1-02.md) · [技术对比](research/M1-02-comparison.md)：Holdem 与官方 Tauri 2 的真实 Windows 验证
- [M1-03](tasks/M1-03.md) · [UI 比较](research/M1-03-comparison.md)：SpaceUI 与 shadcn/ui
- [P2 阶段实时跟踪 Issue #31](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/31) · [r21 PR #40](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/40)
- [P3/P4 研究与执行 Issue #37](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/37)

## 证据与变更纪律

- `main` 暂无完整桌面应用正式发行工程；当前 `apps/desktop` 在堆叠开发 PR，不能按研究仓库导入错版本。
- 设计 SVG、合成浏览器截图、CI 和 Windows 实机结果必须明确不同证据类型，不可混淆。
- 产品约定调整记录确认日期与用户原选择；遇到未决项先查 [登记簿](open-decisions.md)，不要重新发起完整问卷。
- 文件、设备、SQLite、网络、模型和费用遵守最小权限与 R3 Gate。默认不公开个人素材、路径、Token 或真实 DB。
