# Codex入口 · 柠猫文件工作站

2026-10-24。当前开发入口integration/v0.1-p0-p1 / Issue #29；尚无正式稳定发行版。main已接纳研究/规范，不代表集成功能已获发布批准。

## 开始前读取

AGENTS.md → MEMORY.md → docs/product-decisions.md（全部43项） → docs/execution/v0.1-p0-p4-2026-10-24.md → design.md与apps/desktop/DESIGN.md → docs/roadmap.md → docs/milestones/M1.md → GEMINI.md与docs/AI_REVIEW_WORKFLOW.md。再查实时Issues、PR base/head和CI，不以旧快照当事实。

## 当前完整候选

[阶段集成记录](stages/P0-P1-integration.md)说明真实依赖、#9文档冲突、受控合并、旧候选与回滚。#28功能底座包含#9/#11/#13/#21/#22/#24/#26的全部祖先提交；无需机械重复合并。#19的公开诊断文档单独保留，Gemini接入不阻断主线。

P0/P1已有引用与绑定复制、冲突保护、SQLite、缩略图、默认打开/Space、排序/筛选/视图记忆及失效引用修复。本阶段加入卡片直接调用原生Copy、正式紧凑窗口与仅尺寸记忆；不会改Copy/Store安全语义。浏览器38项与本机生产构建通过，精确Windows构建结果、EXE/MSI身份以阶段PR/产物记录为准。

原生OLE与目标接收、来源哈希、取消/异常、重启和尺寸恢复、125%/150%及多屏尚未验证；[集中验收清单](stages/P0-P1-windows-acceptance.md)配合scripts/stage-acceptance.ps1的合成数据使用。Prepare/Verify不启动软件；Launch必须先获得用户桌面许可。不继承探针或旧EXE的验收结论。

## 直接推进顺序

1. 完成P0/P1精确包、来源与CI证据，集中原生验收后才请求文件安全/正式视觉合并。
2. P2复用Tauri窗口与Store，交付真orb↔shelf、位置/尺寸恢复、置顶、贴边和Dock；管理中心按需打开，不加入空白假功能。在验收等待期间可准备独立低风险实现。
3. P3先局域网接收确认、受保护字节传输、冲突/失败/进度与哈希一致，再另审远程/同步，不公开本地目录。
4. P4先授权范围内本地跨架元数据检索，再可选AiProvider、修改预览/确认/可恢复；默认无付费API和隐私上传。

## 不得越过

只操作本仓库；保留全部43项和旧候选。不得自动安装、弹窗、模拟输入、强推、删除用户数据或合并高风险PR。模型调用须先确认官方授权与额外费用关闭；#17目前未满足，0请求。CI不代替真实Windows操作，候选未签名不称正式发行。

按阶段汇报实际链路、精确版本、自动/原生证据、限制、回滚和下一可执行事项；同步MEMORY、设计、路线、Issues/PR，避免细碎Draft堆积。
