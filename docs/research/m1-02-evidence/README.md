# M1-02 脱敏证据

测试日期 2026-10-23，Windows 11 单屏 125%。准确程序 SHA256、步骤、限制和源码来源见 [比较报告](../M1-02-comparison.md)。

- `b-copy-verification.json`：B 英文/中文空格拖出后，16:57 保存的来源存在性与双方 SHA256 快照。
- `a-drag-verification.json`：随后 A 从 B 目标引用英文合成副本并拖出，17:04 发现直接来源被移动，最初合成素材仍在。
- `b-inbound-verification.json`：17:05 B 接收 A 目标中的文件，事件及来源哈希核对。
- `b-selected-events.json`：只保留测试事件、文件名及进程内毫秒计时；包含两次启动，计时在启动后重置，不能当作连续墙钟时间。两个 WebView 监听同一广播会有重复前端事件。
- `memory-a.json` / `memory-b.json`：单次 Debug 空闲快照；B 两个预建 WebView，不能据此严格比较性能。

排序事件没有附带窗口标签，因此使用实际窗口截图与同一时刻事件联合判断：主窗口 Alpha、Beta、Gamma；HTML 对照窗 Beta、Alpha、Gamma。截图仅在本地界面核对，没有把包含 Explorer 导航或其他用户窗口的信息上传。

这些记录是本机测试观察，不是密码学签名、自动 GUI 测试或完整兼容认证。原始日志、绝对本地路径、用户名、进程标识、WebView 数据、工具链和测试运行目录均不提交。
