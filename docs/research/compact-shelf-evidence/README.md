# 紧凑架浏览器证据

2026-10-24，独立 feat/compact-file-shelf 候选。截图由测试专用 harness 及合成文件名生成，不读取磁盘素材。测试与生产分开构建，截图不是原生 Windows/DPI 验收。

| 场景 | 深色 | 浅色 | 几何 |
|---|---|---|---|
| 340×320 | [截图](dark-340.png) | [截图](light-340.png) | [深色](dark-340.json) / [浅色](light-340.json) |
| 420×520 | [截图](dark-420.png) | [截图](light-420.png) | [深色](dark-420.json) / [浅色](light-420.json) |
| 640×720 | [截图](dark-640.png) | [截图](light-640.png) | [深色](dark-640.json) / [浅色](light-640.json) |

附加状态：[最小窗菜单](menu-340.png)、[无搜索结果](search-empty-420.png)、[复制/拖入语义](copy-340.png)、[任务取消记录](tasks-340.png)、[权限错误](error-340.png)、[错误后刷新为离线状态](offline-error-340.png)。

运行方式：设置 COMPACT_EVIDENCE 为输出目录后执行 apps/desktop 的 build:test 与 test:ui；默认测试不会写这些证据。几何 JSON 仅记录视口、文件区高度、顶栏高度、列数、横向溢出和文件名字号。图片为可复现测试截图，无外部图片资产或 AI 图像。

不要把这些截图当成最终视觉批准、真实复制/系统拖放或原生默认应用打开成功的证据。完整行为、边界和回滚见 [任务](../../tasks/compact-file-shelf.md)；PR/Issue 保存精确提交、CI 和候选产物身份。
