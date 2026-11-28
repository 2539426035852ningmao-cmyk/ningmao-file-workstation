# 当前工作

互传与账号整合入口是 [PR #132](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/132)。从「更多操作 → 账户」可以在 Windows 注册、登录、游客使用和打开网页版。自建站点首页可独立建区并邀请软件端。下阶段界面方向先讨论参考、高频动线、图标与动效，再做设计稿和实现。开发时实时核对整合 PR 的合并状态及 [当前交付](docs/execution/ACTIVE-DELIVERY.md)。

柠猫文件工作站互传与同步开发以「柠猫文件工作站-工作01」已验收的 D15 为应用基线。源码提交为 `459558c1aad1861f418b244002f76630bcc7ff6c`，交接 PR #103 的头分支为 `feat/d14-media-loading`。项目互传接续在 `codex/d15-transfer-baseline`，分支包含 D15 源码提交，并整合了网页、Windows 原生与 Android 模拟器的互传工作。正式交付状态仍见[当前交付](docs/execution/ACTIVE-DELIVERY.md)。

后续界面增量沿用 D15 的主题、控件及文件架交互。D15 验收包名为 `Ningmao-D15-459558c.zip`，SHA-256 为 `5df2d8d009d61795364040da46c639be0414874f3acda3e2b59e46ef1b8685e5`。回归优先核对详细列表的横向音频波形和「显示与整理」中的视图、排序分隔线。

用户已完成单机双端收发功能验收。工作站内启停本机站点的候选 `f2235c6` 已通过 Windows 与浏览器实测。异网与移动端验证在 `codex/room-https-validation` 和草稿 PR #115 接续。完整场景和待验证项见[自托管 HTTPS 验收](docs/execution/TEMPORARY-ROOM-HTTPS-ACCEPTANCE.md)。账户与设备授权、指定对象分享和持续同步继续按[路线图](docs/roadmap.md)推进。

D15 原生 20 GB 回环与全量界面回归已经通过，详见[Windows 原生分块验收](docs/execution/TEMPORARY-ROOM-NATIVE-BULK-ACCEPTANCE.md)。两台独立 Windows 虚拟机可以计入双机验收，已分别通过自建 HTTPS 临时互传、[原生局域网顺序双向直传、断链、主动取消及安全重试](docs/execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)。局域网接着补双向并发压力，跨网与移动端各自保留场景证据。
