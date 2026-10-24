# 元数据显示排序证据

2026-10-24，feat/metadata-sorting，底座#24。隔离harness、合成路径/元数据，不包含私人素材或真实WebView资料。

- sort-420-dark.png：420×520深色菜单，大小降序已选中，菜单保留滚动
- sort-340-light.png：340×320浅色菜单，键盘可聚焦新增排序，低频操作仍可滚动到达
- verification.json：底座、截图哈希与未执行的原生验收

设置SORT_EVIDENCE为输出目录，构建测试入口后运行metadata-sorting.spec.ts即可复现截图。截图只说明浏览器菜单层，不证明Windows实机拖放、DPI、进程重启或安装。最终精确源码/CI/包身份见PR和Issue #25。
