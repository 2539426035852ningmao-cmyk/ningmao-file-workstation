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

M1-03 的 SpaceUI 与 shadcn/ui 研究原型已合入 main。主工程采用独立 Tauri 2 / Rust / React / TypeScript / SQLite，UI 以 shadcn/ui 为主，SpaceUI FileThumb 按需复用。当前真实程序在 #30→#32→#35→#36→#40 堆叠未合并 PR 中，最新 P2 r21 已经通过浏览器/Rust/Windows CI，并有基础快捷键实机 PASS；但跨窗文件操作、回收、DPI/多屏完整 Windows 验收仍未完成，没有正式 Release。默认产品为小型悬浮架，而非 1120×760 研究型大型工作台。状态证据见 docs/project-status.md，开发入口见 docs/codex-start-here.md。

## Brand Commitments

中文名柠猫文件工作站，英文名 Ningmao File Workstation；深浅双主题，默认蓝色强调色；不改已定产品需求。统一采用已获批准的 shadcn/ui 主设计系统，遵循根目录 design.md 的圆角、间距、文字与渐进式操作规范；设计尺寸仍需用户体验验收。

## Evidence on Hand

已确认的原 V0.1 43 项决策 + 独立 P4 44 项（docs/product/P4-confirmed-decisions-01-44-2026-10-26.md）；历史 M1 Windows 研究证据；P2 r19 指定 UI 用户验收；P2 r21 最新构建、CI 和部分 Windows 快捷键实测。无正式发行版；未审定最终品牌图像；不同源码/二进制之间不继承 PASS。P3 免费 LAN / P4 AI 插件目前为待实施计划，不把文档当成实际能力。

## Product Principles

- 真实功能、成熟开源复用、文件安全和 Windows 实机验证优先。
- 不静默覆盖或移动来源；移除引用不删除磁盘文件。
- 交互清晰、工具栏渐进呈现、可收起导航，默认隐藏 Inspector。
- 以实际源码和可复现实测记结论，未测项明确保留。

原 V0.1 的 43 项决策与 P4 的 44 项分别冻结，不合并编号；未决选型和需要专项授权的事项见 docs/open-decisions.md，不启动大规模重复访谈。
