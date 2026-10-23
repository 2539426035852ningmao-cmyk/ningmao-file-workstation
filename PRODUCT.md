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

M1-03 已验收，M1-04 按推荐方案获批准：独立 Tauri 2 与 shadcn/ui 主系统，选择性复用 SpaceUI FileThumb。当前 M1-05 实施真实文件引用、SQLite 持久化、主动目录绑定、安全复制、缩略图和原生拖出。自动测试中的合成数据单独构建，不进入产品 dist；不削减后续全部 43 项需求。

## Brand Commitments

中文名柠猫文件工作站，英文名 Ningmao File Workstation；深浅双主题，默认蓝色强调色；不改已定产品需求。主工程继承已验收的 shadcn/ui 界面，不叠加第二套主题；模板图标仅作候选图标。

## Evidence on Hand

已冻结的 43 项选择、M1-02 Windows 实测与准确二进制哈希。没有正式产品发行版、品牌图像或私人测试素材；原型采用本地合成素材。

## Product Principles

- 真实功能、成熟开源复用、文件安全和 Windows 实机验证优先。
- 不静默覆盖或移动来源；移除引用不删除磁盘文件。
- 交互清晰、工具栏渐进呈现、可收起导航，默认隐藏 Inspector。
- 以实际源码和可复现实测记结论，未测项明确保留。

本记录直接整理用户已确认的 43 项决策及本轮继续授权，不新增需求或重做需求访谈。
