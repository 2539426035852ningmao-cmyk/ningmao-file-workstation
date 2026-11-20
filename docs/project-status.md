# 项目状态

互传与同步开发以「工作01」已验收的 D15（`459558c1aad1861f418b244002f76630bcc7ff6c`）为桌面基线，从 `codex/d15-transfer-baseline` 接续。2026-11-20 核对 GitHub，`develop` 仍记录 D13，[D15 交接 PR #103](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/103)与[互传 PR #111](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/111)均处于草稿。D13 的包、源码和检查结果见[当前交付](execution/ACTIVE-DELIVERY.md)。

| 能力 | 实际状态 |
| --- | --- |
| 文件架与工作区 | 支持引用收集、绑定目录复制、悬浮球、独立子架、撤销重做与工作区自动接续。D13 迁移后已正常启动，并核对数据库关键记录。 |
| 预览与缩略图 | 图片、可播放音视频、文本、PDF 和简化 Office 内容。D12 Windows 实测竖屏 MP4、横屏 WebM 封面；D13 验证当前素材架、独立子窗和图片预览。 |
| 加载与检索 | 首屏优先，空闲预取下一行图片，缓存较小的缩略图与视频封面。名称/标签检索已实现；正文检索未实现。 |
| 局域网互传 | 两台 Windows 虚拟机已通过隔离网段的原生发现、证书核对、拒收后重试、双向校验和同名保留。链路中途断开、主动取消和并发双向压力待补[双机实测](execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)。 |
| 跨网与浏览器互传 | 已有浏览器、WebRTC/WSS、桌面桥接和自建 HTTPS 临时互传区。通过[Windows 原生回环](execution/TEMPORARY-ROOM-NATIVE-BULK-ACCEPTANCE.md)、[两台 Windows 虚拟机安装版](execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)和[Android 模拟器](execution/TEMPORARY-ROOM-ANDROID-ACCEPTANCE.md)验收。不同真实网络和实体移动设备待验。 |
| 账户与同步 | 登录、设备绑定、跨账号分享和持续同步未交付。 |
| 发行 | Windows 候选供测试。临时互传预览 MSI 已在两台 Windows 虚拟机运行并互传。正式发行、物理设备的安装升级/卸载与全 DPI、多屏矩阵待验。 |

下一阶段顺序见[路线图](roadmap.md)。历史批次及旧页面见[历史索引](archive/README.md)。
