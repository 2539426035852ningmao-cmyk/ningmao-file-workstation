# Codex入口 · 柠猫文件工作站

2026-10-24。唯一主工程apps/desktop，尚无正式稳定发行版。P0/P1为PR #30 / integration/v0.1-p0-p1；P2为Issue #31 / feat/p2-desktop-loop，不向main直接推功能，不自动合并。

## 开始前读取

AGENTS.md → MEMORY.md → docs/product-decisions.md（全部43项） → docs/execution/v0.1-p0-p4-2026-10-24.md → design.md与apps/desktop/DESIGN.md → docs/roadmap.md → docs/milestones/M1.md → GEMINI.md与docs/AI_REVIEW_WORKFLOW.md。再查实时Issues、PR base/head和CI，不以旧快照当事实。

## 已有候选与证据

[阶段集成记录](stages/P0-P1-integration.md)说明真实依赖、#9文档冲突、受控合并、旧候选与回滚。#28包含#9/#11/#13/#21/#22/#24/#26祖先功能，旧9个Draft已关闭未合并，由#30接替，历史分支和包保留。#19公开诊断单独保留，Gemini #17仍授权/Pro/额外收费UNKNOWN、0模型请求，不阻断产品开发。

P0/P1 r10精确源码8ad5760279e43ba3ab306f49fa8cdbc6f0b87ade，构建779c36c11e6bd80b6bef608adb9a68ff977ef77c，两者完整tree一致。44浏览器/18Rust、fmt/Clippy、Windows编译/MSI、本机完整性核验通过。用户Ctrl/Shift/框选及整组Copy、绑定3文件安全复制/重名保护、完整退出重启/尺寸恢复、手柄排序/Space/默认打开核心原生复测通过，源/目标SHA256与SQLite已核对。见[多选证据](research/P0-P1-multiselection-evidence/README.md)与[集中验收清单](stages/P0-P1-windows-acceptance.md)。

尚待产品验收与合并批准；Win10/DPI/多屏/创作软件/安装升级卸载及原生取消等未测项目继续保留，不能继承研究探针结果。r10末尾物理Esc停止电脑控制，未经新桌面许可不操作仍在场的测试窗。

## 当前开发与完整线路

P2独立分支以76658ecc为基线，继续使用PR #32。r11源码2175ef1与精确包已通过48浏览器/22Rust/Windows/MSI及本机只读核验，保留为历史候选。最新r12新增按需manager窗口、SQL元数据检索/详情/批量标签/任务取消/桌面设置、左右贴边细柄与鼠标唤出/延迟收起、入口置顶/复制状态点和主题同步；v1原件保留、只写v2。58浏览器/27Rust、fmt/Clippy、Windows编译/MSI与双平台仓库检查及本机包核验通过，精确记录见research/P2-management-edge-evidence/r12-verification.json；新二进制未启动/安装，不能继承r10结果。多架独立窗口、拆合、全局快捷键与真实DPI/断屏仍待完成，不称完整P2通过。见[P2本轮说明](stages/P2-management-edge.md)、[P2入口](stages/P2-development-entry.md)及[r11证据](research/P2-first-loop-evidence/r11-verification.json)。

继续顺序：P0/P1正式验收与批准独立保留 → P2补齐桌面闭环和管理中心，并集中验收精确新包 → P3先LAN双设备接收确认/受保护字节传输/冲突失败进度/哈希一致，再远程/同步 → P4先授权范围内本地跨架元数据检索，再可选AI建议与操作预览/确认/恢复。全部43项、设计合同和用户操作习惯保留，不用未来接口和模拟数据冒充交付。

## 工作边界

默认后台/无头/云端；禁止擅自打开候选、资源管理器、安装器或使用鼠标键盘。scripts/stage-acceptance.ps1仅Prepare/Verify无窗口，Launch须用户明确方便。模型费用/授权未确认不得调用；文件安全、正式视觉、权限、重大架构、正式发布各保留人工门槛。保留来源、旧环境与历史证据，不强推或删除数据。

同步MEMORY、设计约束、路线、Issues/PR；按阶段汇报源码/构建/产物身份、自动与原生证据、限制及回滚，不堆积零散Draft，不声称已经安排未设置的后台自动继续。
