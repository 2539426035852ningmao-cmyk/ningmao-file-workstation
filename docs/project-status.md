# 项目状态

互传与同步开发以「工作01」已验收的 D15（`459558c1aad1861f418b244002f76630bcc7ff6c`）为桌面基线，从 `codex/d15-transfer-baseline` 接续。2026-11-21 核对 GitHub，`develop` 仍记录 D13，[D15 交接 PR #103](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/103)与[互传 PR #111](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/111)均处于草稿。D13 的包、源码和检查结果见[当前交付](execution/ACTIVE-DELIVERY.md)。

| 能力 | 实际状态 |
| --- | --- |
| 文件架与工作区 | 支持引用收集、绑定目录复制、悬浮球、独立子架、撤销重做与工作区自动接续。D13 迁移后已正常启动，并核对数据库关键记录。 |
| 预览与缩略图 | 图片、可播放音视频、文本、PDF 和简化 Office 内容。D12 Windows 实测竖屏 MP4、横屏 WebM 封面；D13 验证当前素材架、独立子窗和图片预览。 |
| 加载与检索 | 首屏优先，空闲预取下一行图片，缓存较小的缩略图与视频封面。名称/标签检索已实现；正文检索未实现。 |
| 局域网互传 | 两台 Windows 虚拟机已通过隔离网段的原生发现、证书核对、拒收后重试、顺序双向校验、断链、主动取消和重试后的同名保护。浏览器回归已验证断线后的逐项重试和未发现设备时的连接入口。双向并发压力待验。[双机实测](execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md) |
| 跨网与浏览器互传 | 已有浏览器、WebRTC/WSS、桌面桥接和自建 HTTPS 临时互传区。通过[Windows 原生回环](execution/TEMPORARY-ROOM-NATIVE-BULK-ACCEPTANCE.md)、[两台 Windows 虚拟机安装版](execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)和[Android 模拟器](execution/TEMPORARY-ROOM-ANDROID-ACCEPTANCE.md)验收。不同真实网络和实体移动设备待验。 |
| 临时互传区 | 网页建区、链接加入、可选入区审批、最多三位管理员。发件人可管理自己的文件，群主和管理员可延期或撤回区内文件。桌面可加入已有站点，从文件架发送或确认保存。房主在桌面内一键开站仍待开发。 |
| 在线供件 | 浏览器可手动共享已校验的完整文件，已有接手供件和站点回退的合成回归。安卓模拟器已验休眠退出与唤醒后手动恢复。房间成员、邀请及来源发现依赖站点，站点离线自治和 NAS 常驻供件仍待验证或开发。 |
| 账户与同步 | 已有基于 Cloudflare Access 的账户身份验证、Windows 一次性配对码和授权撤销。浏览器配对界面使用合成账户验收。自托管账户从登录到解绑的完整交付、指定账户分享和持续同步仍待完成。 |
| 发行 | Windows 候选供测试。临时互传预览 MSI 已在两台 Windows 虚拟机运行并互传。正式发行、物理设备的安装升级/卸载与全 DPI、多屏矩阵待验。 |

下一阶段顺序见[路线图](roadmap.md)。历史批次及旧页面见[历史索引](archive/README.md)。
