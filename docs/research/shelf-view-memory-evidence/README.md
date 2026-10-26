# 每架视图记忆证据

2026-10-24，独立 feat/shelf-view-memory 候选，合成文件与隔离浏览器设置；未读取用户素材、真实WebView配置或账号数据。

- [重载后恢复列表/名称排序/大缩略图](restored-view.png)：菜单勾选与已恢复视图一致
- [保存失败但仍可临时显示](save-failed.png)：明确提示未保存，不与文件记录混淆
- verification.json 记录底座、后端不变与图像哈希，最终源码/构建/CI身份在PR和Issue中记录

复现：设置 VIEW_MEMORY_EVIDENCE 为输出目录，构建测试入口后运行 shelf-view-memory.spec.ts 中“每架独立”“写入配额失败”两项。默认测试不输出截图。所有输入为合成，生产dist不包含harness。

截图证明浏览器层状态，不证明Windows原生重启、文件操作、DPI或安装验收。实现和回滚边界见 [任务](../../tasks/shelf-view-memory.md)。
