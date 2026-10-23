# M1-02 技术基线 B

来自官方 create-tauri-app 4.7.5 的 React + TypeScript 模板，只用于技术验证。不是正式前端、文件管理器或已批准主工程。保留模板图标；来源与许可见 [第三方记录](../../../docs/third-party.md)。

复用 drag-rs 2.1.0 的 Windows OLE 拖出，显式 `DragMode::Copy`。IPC 只能拖出程序创建的两个已知合成文件；现有同名文件内容不符时拒绝覆盖。主窗口开启 Tauri 原生接收，HTML 对照窗口关闭原生接收，以验证内部排序冲突。

在 Windows 安装 Node.js 24、Rust 1.99.1、MSVC Build Tools、Windows SDK 和 WebView2 后，从仓库根目录执行：

```powershell
pwsh -NoProfile -File scripts/m1-02/build-baselines.ps1 -Baseline B
```

默认程序输出在本目录 `src-tauri/target/debug/ningmao-m102-baseline.exe`；设置了 `CARGO_TARGET_DIR` 时以该目录为准。直接运行不需要开发服务器。程序默认把合成文件及 JSONL 日志保存到自身应用数据目录的 `m1-02-synthetic`；可在启动前用 `NINGMAO_M102_RUN_ROOT` 指定专用测试目录。不会自动清空测试目录。

1. 点“打开合成素材”，把文件拖入主窗口虚线区，检查 `native-drop`。
2. 打开 B 目标文件夹，把两枚拖出按钮分别拖到资源管理器空白处。确认目标哈希与来源一致、来源仍在。已有文件的系统冲突对话请取消。
3. 分别把主窗口与 HTML 对照窗口的 Alpha 拖到 Gamma，检查是否变成 Beta、Alpha、Gamma，及 `html-reorder` 日志。
4. 注册测试快捷键，按 Ctrl+Alt+Shift+F12；查看 `shortcut-fired`。重复注册或系统冲突应返回错误。
5. 切换置顶；托盘提供 Show / Quit。关闭到托盘、跨显示器恢复、正式目录操作均未实现。

完整结果及未测项见 [M1-02 报告](../../../docs/research/M1-02-comparison.md)。禁止把 CI 编译成功当作人工拖放通过。
