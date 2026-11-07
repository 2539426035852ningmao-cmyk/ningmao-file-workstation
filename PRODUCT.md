# 柠猫文件工作站

<!-- impeccable:product-schema 1 -->

## Platform

web

界面技术为 React WebView，交付目标为 Windows 10/11 桌面应用。以上分类仅供界面工具使用，不表示交付网站。

## Product Purpose

轻量桌面悬浮文件工作站：临时文件架默认持久保存引用，真实目录文件架默认复制并保留来源。多标签可拆分和合并，悬浮架承担日常操作，管理中心按需打开。

## Operating Context

Windows 资源管理器与桌面创作应用之间的素材接收、整理、预览和拖出。具体用户职业没有另行限定，不补造画像。完整事实以 docs/product-decisions.md 的 43 项冻结决策和 docs/m1-execution-baseline.md 为准。

## Capabilities and Constraints

当前应用为PR #68/5713c47359445664d43c806322f74c3c96456b42候选，继承PR #62；完整桌面工程仍未合并main。已有文件工作站、窗口/Dock、任务/回收、本地搜索/规则、LAN互传和可配置AI；开发构建完成过本机浏览器分享原生下载/取消，组件未随r7分发，入口隐藏。真实双机、手机/跨网、真实AI、多DPI/多屏和正式发布门槛仍未全部通过。技术沿用Tauri 2/Rust/React/TypeScript/SQLite及shadcn/ui，不改变框架。最新精确状态以docs/execution/ACTIVE-DELIVERY.md为准。

## Brand Commitments

中文名柠猫文件工作站，英文名 Ningmao File Workstation；白色、深蓝、亮蓝三套完整主题，默认蓝色强调色；不改已定产品需求。统一采用已获批准的 shadcn/ui 主设计系统，遵循根目录 design.md 的圆角、间距、文字与渐进式操作规范；设计尺寸仍需用户体验验收。

## Evidence on Hand

原43项与P4独立44项冻结决定、历史分SHA原生证据、r7本机128界面/102Rust通过（6跳过）、显式服务专项与r7原生启动/退出。当前5713c47全量147界面及Desktop/Preview/P3三组CI通过；原生子集含启动/重启、窗口控件、合成来源保留；这些结果不等于真实双机/模型/全Windows矩阵通过。精确证据及边界见ACTIVE-DELIVERY，能力总览见docs/project-status.md。

## Product Principles

- 真实功能、成熟开源复用、文件安全和 Windows 实机验证优先。
- 不静默覆盖或移动来源；移除引用不删除磁盘文件。
- 交互清晰、工具栏渐进呈现、可收起导航，默认隐藏 Inspector。
- 以实际源码和可复现实测记结论，未测项明确保留。

原 V0.1 的 43 项决策与 P4 的 44 项分别冻结，不合并编号；未决选型和需要专项授权的事项见 docs/open-decisions.md，不启动大规模重复访谈。
