# 柠猫文件工作站 · Windows 主工程

应用使用 Tauri 2、Rust、React、TypeScript 和 SQLite。当前支持范围和候选见[项目状态](../../docs/project-status.md)与[当前交付](../../docs/execution/ACTIVE-DELIVERY.md)。

## 构建与验证

需要 Windows、PowerShell 7、Node.js 24、Rust 1.99.1、MSVC、Windows SDK 和 WebView2。在仓库根目录运行：

```powershell
pwsh -NoProfile -File scripts/build-desktop.ps1 -Native
pwsh -NoProfile -File scripts/build-desktop.ps1 -Browser
```

便携包和可检查的 MSI 见[打包说明](../../docs/preview-package.md)。最终前端资源嵌入应用；测试模拟后端只在单独的测试构建中。

## 运行与数据

便携包用 `Start-Ningmao.vbs` 启动，接续已登记工作区；首次默认使用当前用户 LocalAppData 下的 Ningmao/Workspace。开发验收为每个合成场景单独设置 `NINGMAO_DATA_DIR`、`WEBVIEW2_USER_DATA_FOLDER` 及 `NINGMAO_WORKSPACE_REGISTRY`。禁止公开真实路径、工作库或个人素材。

普通文件架保存引用，绑定目录导入安全复制；同名文件保留双方。六点手柄用来排序，卡片可直接拖出。回收、复制、预览和语音行为以[试用说明](../../docs/first-preview-quickstart.md)为准。备份先完整退出，再复制工作区的 `data` 和 `webview`，不要单独覆盖正在使用的 SQLite 主文件。

许可和复用记录：[第三方说明](../../docs/third-party.md) · [主工程来源清单](source-provenance.json)。
