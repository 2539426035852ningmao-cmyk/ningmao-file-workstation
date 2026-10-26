# 文档目录

- [Gemini 独立复核工作协议](AI_REVIEW_WORKFLOW.md)：借鉴已完成的双 AI 交叉验证，Gate A/B/C 先核验官方 CLI 与费用再进行只读审查。
- [M1 Gemini 接入任务](tasks/M1-GEMINI-REVIEW.md)：当前准备完成与待 Windows 实际验证的区分；根目录 [GEMINI.md](../GEMINI.md) 为独立审查规则。

- [轻量悬浮文件架设计规范](../design.md)：窗口尺寸、同心圆圆角、间距、文字层级、扩展入口和阶段验收基线（建议 Token 部分需用户验收）。
- [Codex 从这里开始](codex-start-here.md)：最新已核查状态、PR 依赖、下一门槛与行动顺序。
- [阶段路线图](roadmap.md)：P0 核心文件 → P1 小窗 → P2 Dock → P3 网络 → P4 AI 与插件。
- [P3/P4 开源方案与风险研究（2026-10-26）](research/P3-P4-open-source-reuse-2026-10-26.md)：按社交反馈→技术社区→GitHub→官方文档核对 LocalSend/iroh/FTS5/FastEmbed 等复用候选、许可、安全与待验证边界。
- [P3 免费优先与克制型 UI 合同](design/P3-free-first-lean-ux-contract-2026-10-26.md)：LAN 默认无云端服务账单、轻量后台、各层区域职责、唯一发送入口和集中原生验收；不自动开放端口或启用付费中继。
- [P3/P4 Codex 实施关卡](execution/P3-P4-implementation-gates-2026-10-26.md)：隔离探针、LAN 双机实测、跨架索引、可选 AI 的阶段目标与 R3 审批要求；**文档研究已完成，不代表 P3/P4 已实现或已批准联网/模型费用**。

- [43 项产品与工程决策](product-decisions.md)：逐项保留用户选择，第 25 项保留补充说明。
- [M1 原始执行基线](m1-execution-baseline.md)：共享记录中的正式交接文本。
- [M1 开发任务记录](milestones/M1.md)：顺序、验收门槛和当前状态。
- [M1-01 验收记录](tasks/M1-01.md)：初始化范围、验证方法及证据入口。
- [M1-02 任务记录](tasks/M1-02.md)：双基线交付、状态及未完成项。
- [M1-02 技术比较](research/M1-02-comparison.md)：源码发现、Windows 实测、复现步骤和主工程建议。
- [M1-03 任务记录](tasks/M1-03.md)与 [UI 比较报告](research/M1-03-comparison.md)：两套组件原型、截图、交互及虚拟列表采样。
- [第三方代码与工具清单](third-party.md)：来源、版本、许可和审查状态。

需求变更须明确记录并经用户批准。后续技术决策及实机测试记录在实际任务开始时添加；未执行的工作不能标记通过。
