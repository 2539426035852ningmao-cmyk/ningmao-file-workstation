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

研究阶段 M1-03 的 SpaceUI 与 shadcn/ui 原型已验收；主工程已获批准采用独立 Tauri 2 / Rust / React / TypeScript / SQLite、shadcn/ui主系统、SpaceUI FileThumb按需复用。当前将#9至#28汇入受控P0/P1集成候选，保留引用、Copy、SQLite、修复、预览、排序、筛选和视图记忆；精确原生GUI、安装、DPI、多屏待集中验收。默认产品是小型悬浮架，见design.md；按完整阶段闭环推进P0–P4，不再重做微小原型。

## Brand Commitments

中文名柠猫文件工作站，英文名 Ningmao File Workstation；深浅双主题，默认蓝色强调色；不改已定产品需求。统一采用已获批准的 shadcn/ui 主设计系统，遵循根目录 design.md 的圆角、间距、文字与渐进式操作规范；设计尺寸仍需用户体验验收。

## Evidence on Hand

已冻结的 43 项选择、M1-02/03 Windows 研究实测和自动 CI 记录、M1-05/06 Draft 自动回归与预览包只读检查。无正式发行版；未审定最终品牌图像；实测不在不同精确二进制之间继承。

## Product Principles

- 真实功能、成熟开源复用、文件安全和 Windows 实机验证优先。
- 不静默覆盖或移动来源；移除引用不删除磁盘文件。
- 交互清晰、工具栏渐进呈现、可收起导航，默认隐藏 Inspector。
- 以实际源码和可复现实测记结论，未测项明确保留。

本记录直接整理用户已确认的 43 项决策及本轮继续授权，不新增需求或重做需求访谈。
