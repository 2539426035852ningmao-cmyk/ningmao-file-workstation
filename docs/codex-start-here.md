# Codex入口 · 柠猫文件工作站

2026-10-26当前：UI-B01～B07集中Draft #36，r18实机仍有静置破边/圆角/直接胶囊触顶FAIL，r19修复与原生门槛见[tasks/UI-B01-B07.md](tasks/UI-B01-B07.md)。不自动合并/安装/发布；43项及P2→P3→P4顺序保留。以下旧候选条目为历史记录。


2026-10-25最新收尾：[r16真实抽样与剩余门槛](research/dual-eye-orb-evidence/README.md)。源fdf71b9，80浏览器/36Rust/Windows/MSI及双平台仓库通过，提示截断已修复并用户确认；固定目标引用/Copy、Leave及右键取消和正常退出恢复有精确证据。完整D-ORB/P2仍未验收。r15/r16均正常退出，当前后台；不凭旧许可重新打开桌面，不自动合并、安装或发布。以下“待第一次拖放/未启动”为历史。


2026-10-25 最新接手点：D-ORB 在独立 Draft PR #35 / Issue #34 开发，基于P2 63377ae；[实施与回滚](tasks/D-ORB-implementation.md)。r14已真实固定绑定入口接收约3次、取消后文件与数据库不变；成功反馈仍FAIL，正常退出未完成，新UI不继承原生通过。以下旧“r14未启动”属于历史快照。当前任务禁止自动合并、安装、发布，默认后台；完整P2未验收，P3/P4顺序及43项不变。

2026-10-25最新实机结果：[r13原生报告](stages/P2-r13-native-results.md)。直接文件闭环、拆合、中心与重启抽样通过；Dock投放FAIL R3，重启置顶菜单FAIL R2，整体P2未验收。候选已正常退出，默认后台修复；后续精确包另验，不再反复拖旧r13。以下旧“未启动/待验”为交付时历史状态。

修复候选[r14](research/P2-detached-shelves-evidence/r14-verification.json)现已云端62浏览器/32Rust/Windows/MSI/双平台仓库全绿、本机包只读核验通过。源563ca7d / 构建7e6b780，未启动/安装，原生待集中验证；不能将r13抽样通过或r14自动全绿当成Dock已修好。

2026-10-24。唯一主工程apps/desktop，尚无正式稳定发行版。P0/P1为PR #30 / integration/v0.1-p0-p1；P2为Issue #31 / feat/p2-desktop-loop，不向main直接推功能，不自动合并。

## 开始前读取

先读2026-10-25[最新执行授权](execution/v0.1-p2-acceptance-autonomy-2026-10-25.md)和MEMORY最新段：R0/R1及局部R2按证据/保护规则可自主普通合并；原生生命周期、拖放、归属、取消、DB/素材一律R3，#30/#32阶段合并仍需批准。先集中精确r13原生验收，不以旧CI/旧包结果替代；LAN首次监听/配对需独立授权。

AGENTS.md → MEMORY.md → docs/product-decisions.md（全部43项） → docs/execution/v0.1-p0-p4-2026-10-24.md → design.md与apps/desktop/DESIGN.md → docs/roadmap.md → docs/milestones/M1.md → GEMINI.md与docs/AI_REVIEW_WORKFLOW.md。再查实时Issues、PR base/head和CI，不以旧快照当事实。

## 已有候选与证据

[阶段集成记录](stages/P0-P1-integration.md)说明真实依赖、#9文档冲突、受控合并、旧候选与回滚。#28包含#9/#11/#13/#21/#22/#24/#26祖先功能，旧9个Draft已关闭未合并，由#30接替，历史分支和包保留。#19公开诊断单独保留，Gemini #17仍授权/Pro/额外收费UNKNOWN、0模型请求，不阻断产品开发。

P0/P1 r10精确源码8ad5760279e43ba3ab306f49fa8cdbc6f0b87ade，构建779c36c11e6bd80b6bef608adb9a68ff977ef77c，两者完整tree一致。44浏览器/18Rust、fmt/Clippy、Windows编译/MSI、本机完整性核验通过。用户Ctrl/Shift/框选及整组Copy、绑定3文件安全复制/重名保护、完整退出重启/尺寸恢复、手柄排序/Space/默认打开核心原生复测通过，源/目标SHA256与SQLite已核对。见[多选证据](research/P0-P1-multiselection-evidence/README.md)与[集中验收清单](stages/P0-P1-windows-acceptance.md)。

尚待产品验收与合并批准；Win10/DPI/多屏/创作软件/安装升级卸载及原生取消等未测项目继续保留，不能继承研究探针结果。r10末尾物理Esc停止电脑控制，未经新桌面许可不操作仍在场的测试窗。

## 当前开发与完整线路

最新r13继续同一PR #32，补独立多架拆合、窗口归属和快照隔离、全部拆出时空主窗、逐窗布局v3恢复及跨窗视图保存。本机61浏览器/31Rust与fmt/Clippy/生产构建通过，云端Windows/MSI与本机精确包核验通过；未启动/安装，原生体验待验。[最新实施](stages/P2-detached-shelves.md)。以下r12/r11为历史候选，不把旧权限/布局范围或待实现列表误当r13状态。

P2独立分支以76658ecc为基线，继续使用PR #32。r11源码2175ef1与精确包已通过48浏览器/22Rust/Windows/MSI及本机只读核验，保留为历史候选。最新r12新增按需manager窗口、SQL元数据检索/详情/批量标签/任务取消/桌面设置、左右贴边细柄与鼠标唤出/延迟收起、入口置顶/复制状态点和主题同步；v1原件保留、只写v2。58浏览器/27Rust、fmt/Clippy、Windows编译/MSI与双平台仓库检查及本机包核验通过，精确记录见research/P2-management-edge-evidence/r12-verification.json；新二进制未启动/安装，不能继承r10结果。多架独立窗口、拆合、全局快捷键与真实DPI/断屏仍待完成，不称完整P2通过。见[P2本轮说明](stages/P2-management-edge.md)、[P2入口](stages/P2-development-entry.md)及[r11证据](research/P2-first-loop-evidence/r11-verification.json)。

继续顺序：P0/P1正式验收与批准独立保留 → P2补齐桌面闭环和管理中心，并集中验收精确新包 → P3先LAN双设备接收确认/受保护字节传输/冲突失败进度/哈希一致，再远程/同步 → P4先授权范围内本地跨架元数据检索，再可选AI建议与操作预览/确认/恢复。全部43项、设计合同和用户操作习惯保留，不用未来接口和模拟数据冒充交付。

## 工作边界

默认后台/无头/云端；禁止擅自打开候选、资源管理器、安装器或使用鼠标键盘。scripts/stage-acceptance.ps1仅Prepare/Verify无窗口，Launch须用户明确方便。模型费用/授权未确认不得调用；文件安全、正式视觉、权限、重大架构、正式发布各保留人工门槛。保留来源、旧环境与历史证据，不强推或删除数据。

同步MEMORY、设计约束、路线、Issues/PR；按阶段汇报源码/构建/产物身份、自动与原生证据、限制及回滚，不堆积零散Draft，不声称已经安排未设置的后台自动继续。
