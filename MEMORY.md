# 当前工作

柠猫文件工作站互传与同步开发以「柠猫文件工作站-工作01」已验收的 D15 为应用基线。源码提交为 `459558c1aad1861f418b244002f76630bcc7ff6c`，交接 PR #103 的头分支为 `feat/d14-media-loading`。项目互传接续在 `codex/d15-transfer-baseline`，分支包含 D15 源码提交，并整合了网页、Windows 原生与 Android 模拟器的互传工作。正式交付状态仍见[当前交付](docs/execution/ACTIVE-DELIVERY.md)。

后续界面增量沿用 D15 的主题、控件及文件架交互。D15 验收包名为 `Ningmao-D15-459558c.zip`，SHA-256 为 `5df2d8d009d61795364040da46c639be0414874f3acda3e2b59e46ef1b8685e5`。回归优先核对详细列表的横向音频波形和「显示与整理」中的视图、排序分隔线。

近期任务按顺序是局域网与跨网互传的连接、核对及恢复，再讨论账户设备绑定、跨端共享与同步。遵守独立合成工作区及真实文件、网络的授权范围。

D15 原生 20 GB 回环与全量界面回归已经通过，详见[Windows 原生分块验收](docs/execution/TEMPORARY-ROOM-NATIVE-BULK-ACCEPTANCE.md)。[两台 Windows 虚拟机的 MSI 双向收发与恢复](docs/execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)已通过，走自建 HTTPS 临时互传区。用户确认两台独立 Windows 虚拟机的通过结果计入双机验收，无需提供第二台实体电脑。局域网直传按独立虚拟网段实测，跨网与移动端各自保留场景证据。
