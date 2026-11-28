# 项目状态

互传与同步开发以「工作01」已验收的 D15（`459558c1aad1861f418b244002f76630bcc7ff6c`）为桌面基线，从 `codex/d15-transfer-baseline` 接续。2026-11-22 核对 GitHub，`develop` 仍记录 D13，[D15 交接 PR #103](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/103)与[互传 PR #111](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/111)均处于草稿，互传 PR 以 D15 的头分支为基底。D13 的包、源码和检查结果见[当前交付](execution/ACTIVE-DELIVERY.md)。

| 能力 | 实际状态 |
| --- | --- |
| 文件架与工作区 | 支持引用收集、绑定目录复制、悬浮球、独立子架、撤销重做与工作区自动接续。D13 迁移后已正常启动，并核对数据库关键记录。 |
| 预览与缩略图 | 图片、可播放音视频、文本、PDF 和简化 Office 内容。D12 Windows 实测竖屏 MP4、横屏 WebM 封面；D13 验证当前素材架、独立子窗和图片预览。 |
| 加载与检索 | 首屏优先，空闲预取下一行图片，缓存较小的缩略图与视频封面。名称/标签检索已实现；正文检索未实现。 |
| 局域网互传 | 两台 Windows 虚拟机已通过隔离网段的原生发现、证书核对、拒收后重试、顺序双向校验、断链、主动取消和重试后的同名保护。浏览器回归已验证断线后的逐项重试和未发现设备时的连接入口。双向并发压力待验。[双机实测](execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md) |
| 跨网与浏览器互传 | 已有浏览器、WebRTC/WSS、桌面桥接和自建 HTTPS 临时互传区。通过[Windows 原生回环](execution/TEMPORARY-ROOM-NATIVE-BULK-ACCEPTANCE.md)、[两台 Windows 虚拟机安装版](execution/TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)和[Android 模拟器](execution/TEMPORARY-ROOM-ANDROID-ACCEPTANCE.md)验收。不同真实网络和实体移动设备待验。 |
| 自托管 HTTPS 续验 | Windows 候选与网页经 QEMU 虚拟 NAT 双向收发，续传和同名留存通过。Android 14 模拟器覆盖 HTTPS、虚拟 Wi‑Fi/蜂窝切换、供件离线和站点重启。Android 发现突然断网后供件列表残留，已加供件心跳和 30 秒过期。[本轮验收](execution/TEMPORARY-ROOM-HTTPS-ACCEPTANCE.md) |
| 临时互传区 | Windows 测试包可从临时互传区选暂存目录和配额、启动或停止本机站点，并创建需批准的互传区。同目录重启后继续使用原邀请，已收齐的文件按原时限保留。网页和桌面仍可使用已有的自托管站点。网页支持最多三位管理员、文件延期和撤回。[本机站点验收](execution/TEMPORARY-ROOM-MANAGED-HOST-ACCEPTANCE.md) |
| 文件卡片与定向发送 | 网页和 Windows 显示所选图片的小图、文件类型及成员头像。分块站点支持在全区和所选成员之间切换发送范围。[统一验收](execution/ROOM-FIRST-RELEASE-CANDIDATE.md#指定收件人) |
| 互传操作收尾 | 网页与 Windows 可按文件名及收发方向筛选当前成员可见的文件。撤回最后一份文件时，搜索和筛选控件保留。[搜索焦点 PR #127](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/127) · [统一操作](execution/ROOM-FIRST-RELEASE-CANDIDATE.md#查找文件) |
| 互传首版收束 | 五人并发、连接恢复与操作收尾进入统一 Windows 测试候选。各设备和网络的实测边界见[统一验收](execution/ROOM-FIRST-RELEASE-CANDIDATE.md)。 |
| 手机扫码加入 | 用户已确认本轮交付。网页和 Windows 使用同一条 HTTPS 邀请生成二维码，扫码后沿用群主审批和双向收发。 [扫码使用与验收](execution/MOBILE-ROOM-SCAN.md) |
| 五人文件群 | 网页与 Windows 共用站点的五人上限，群主占一席。已批准才占位，掉线保留，退出或移出才释放。待批准访客单列。 [实现与验收](execution/FIVE-MEMBER-FILE-ROOM.md) |
| 单机桌面与网页联测 | 用户已确认用两个独立房间身份往返收发的功能。候选 `53f6fee` 的流程改进已通过原生来回收发、21 项桌面互传回归、18 项网页界面回归及安卓模拟器回归，操作体验待用户复验。[候选、包校验与复跑记录](execution/TEMPORARY-ROOM-NATIVE-BULK-ACCEPTANCE.md) |
| 在线供件 | 浏览器可手动共享已校验的完整文件，已有接手供件和站点回退的合成回归。安卓模拟器已验休眠退出与唤醒后手动恢复。房间成员、邀请及来源发现依赖站点，站点离线自治和 NAS 常驻供件仍待验证或开发。 |
| 账号、好友与固定文件群 | 网页和 Windows 使用同一自建账号，可确认好友、私聊和创建最多五人的固定群。文字在自建站点保留最近 30 天，可查看最近 100 条。文件沿用现有有效期与领取权限。已通过 Windows 原生登录与工作区隔离、网页与 Windows 在固定群双向文本和网页到软件文件校验。[实施顺序](roadmap.md#账号好友和文件群) |
| 群管理交接 | 固定群可指定备用管理员，站点在线时可接手并交回。浏览器验证交接期间群主与备用管理员的审批权限。合成站点在同一地址以独立目录恢复旧群、旧会话、文字和小文件。主机断电后的跨设备入口定位和在线供件重新接入仍待验。[用法](../apps/web/README.md#群管理交接) |
| 账号与网页入口收束 | Windows 的「更多操作 → 账户」可创建并登录、恢复有效会话、以游客继续或打开网页版。浏览器直接进入自建站点即可创建房间，使用邀请链接加入的一端可以是 Windows 软件。网页保留自己的有效会话，首次接续桌面账号需确认账号名。[用法](../apps/web/README.md#网页站点账号候选) |
| 发行 | Windows 候选供测试。临时互传预览 MSI 已在两台 Windows 虚拟机运行并互传。正式发行、物理设备的安装升级/卸载与全 DPI、多屏矩阵待验。 |

下一阶段顺序见[路线图](roadmap.md)。历史批次及旧页面见[历史索引](archive/README.md)。
