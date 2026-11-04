# P3 浏览器免安装互传与第二 Windows 环境

关联：Issue #58、P3 #37、集成 PR #57。2026-11-05 用户明确新增方向；本文为实施合同与研究结论，功能尚未实现。保留原 43 项及 P4 44 项决定。

## 调查与复用选择

先读本机与已有研究，再检索近期社交/社区反馈，随后核对上游仓库与官方规则。社区反馈仅说明浏览器免安装有实际需求、复杂 NAT 和手机后台会影响体验，不作为兼容/安全实测。检索样本：[近期 PairDrop 使用讨论](https://www.reddit.com/r/MacOSApps/comments/1w7vsbe/)、[selfhosted 讨论](https://www.reddit.com/r/selfhosted/comments/1g1ve42/)。采集时搜索索引日期可能滞后，不据此确定版本。

| 上游、固定 HEAD | 可用思路 | 本项目取舍 |
| --- | --- | --- |
| [croc](https://github.com/schollz/croc/tree/4fc5ac0c8463a3de2b0396205c69a38109863583)，MIT | 官方 web 客户端与 CLI 双向互通；代码、二维码、PAKE、加密 WebSocket 桥接与中继 | 优先隔离验证现成协议与浏览器实现；不要自行重写密码学或假设旧版 CLI 支持新版网页 |
| [FilePizza](https://github.com/kern/filepizza/tree/1e4d02fa91527d8dc83f4094ca394f8c29a88b56)，BSD-3-Clause；字体另有 OFL | 链接分享、WebRTC、Service Worker 流式下载、多文件体验 | 参考分享和下载流程；不整体搬入 Next.js/Redis；若复用代码须保留版权及许可，不复制品牌素材 |
| [PairDrop](https://github.com/schlagmichdoch/PairDrop/tree/1b0c9c9d903c3cfc706df1303dc75c3b54d04c77)，GPL-3.0 | 配对房间、请求确认、直连与 TURN 回退 | 仅学习体验和通用架构，不把 GPL 源码混入 Apache-2.0 发行 |
| [copyparty](https://github.com/9001/copyparty/tree/1af7efeca858dcfa29f797d7ae93f22eb2fdecf0)，MIT | 浏览器上传/下载、可恢复上传、共享目录权限 | 参考落地体验，不把完整文件服务器暴露为用户文件架 |

本轮未复制代码、字体、图片或引入依赖。后续采用任何上游代码前再逐项锁定文件/版本、传递依赖、NOTICE 与署名。croc 的 MIT 主许可不是其全部依赖/资产已清关的证明。

关键原始依据：[croc web README](https://github.com/schollz/croc/blob/4fc5ac0c8463a3de2b0396205c69a38109863583/web/README.md)、[FilePizza README](https://github.com/kern/filepizza/blob/1e4d02fa91527d8dc83f4094ca394f8c29a88b56/README.md)、[PairDrop FAQ](https://github.com/schlagmichdoch/PairDrop/blob/1b0c9c9d903c3cfc706df1303dc75c3b54d04c77/docs/faq.md)。croc 当前网页声明兼容 CLI，并提供本地 relay + Playwright 的真实字节校验测试，值得直接复用其验证方法；本文未执行该套测试，不继承上游 PASS。

## 用户闭环与界面约束

桌面选中一个或多个已登记文件 → 发送到设备 → 浏览器分享 → 创建临时分享 → 复制链接/代码或二维码 → 对方用浏览器打开并确认文件名/数量/大小 → 发送方确认连接 → 显示逐文件进度 → 对方保存。反向在网页选择文件、由桌面明确确认接收到既有绑定架，再复用安全暂存、哈希和同名编号。

免安装同时支持浏览器接收与浏览器发回。首段先验证同一协议的 CLI↔浏览器、浏览器↔浏览器，随后接入桌面；不把一个外部网页链接当作已实现柠猫任务集成。桌面球体/Dock 不加常驻网络按钮，小架仅在选中文件时提供发送入口，管理中心负责分享、任务及停止。网页只保留连接/文件/进度，不展示 SQLite、磁盘路径或桌面权限。

分享为临时能力，用户可主动停止并使链接失效；链接过期显示明确提示。秘密代码/密钥不进入查询参数、服务器日志、分析系统或持久存储，优先沿用已审查上游的 fragment/代码握手方案。短代码的尝试限制与有效期随上游安全机制落实，不能当永久下载地址。浏览器不获得 Tauri IPC 或任意本地目录访问权，不提供上游 SSH/远程终端能力。

网页分别显示“已接收并校验”和“已提交浏览器保存”。浏览器不能确认实际写盘时，不声称“已保存到磁盘”；明确要求保持页面在线，移动端锁屏/后台导致中断时提示重试，不静默重发。多文件分别记录终态；只在实际内容验证后成功。

## 网络与成本

优先现有 croc 适配器及官方兼容浏览器端，复用原有任务展示；浏览器协议模块隔离，不新建用户数据库。桌面接收仍由 Rust 持有文件权限和写入职责。若 Go sidecar 进入产品，先核验体积/进程退出/取消/签名分发，浏览器与 Go 的进度映射实测后才接任务成功。

互联网链接必须有双方可达的 HTTPS 网页及信令/桥接服务；直连不保证穿透所有 NAT。若必须中继则说明加密中继路径和运营流量成本。不能将局域网 IP、自签名 HTTPS 地址或仅本机 localhost 链接包装为互联网免安装功能。浏览器不能像 Rust 客户端那样自行绕过证书提示。

首版先验证在线临时分享；离线加密寄存不是本轮必要功能，不默认上传云盘或启用 croc 存储/SSH/分析。已有公开服务只作可选互通验证；正式产品的可用性与服务条款不能依赖“公共中继永远免费”。公开部署、域名、费用、外部监听及运营配置按已有专项关卡执行。

## 交付顺序及退出条件

1. 固定上游源码，在独立实验中运行 CLI↔浏览器双向合成文件测试，本地 relay/bridge，不启用公共服务。校验中文、多文件、哈希、同名、取消、拒绝与关闭页面。复用现有 Playwright，不再安装一套测试框架。
2. 通过后才接入现有任务中心和分享 UI；三种表面：桌面创建分享、网页确认并接收、网页发送到桌面。API/文件权限由主程序保持，不让浏览器执行本地命令。
3. 经部署范围明确后验证真正跨网络、手机 Safari/Chrome 的真实下载与反向上传；强制中继单列测试，不能只测同机两个浏览器。
4. 第二 Windows 真机/VM 单列：源/目标 SHA256、来源保留、旧同名保护、取消清理、拒收不写入、重启任务恢复。原生与浏览器证据分开。每步记录 SHA、配置、结果和回滚；不自动合并。

回滚：实验/网页适配器可独立停用；旧 LAN 与 r4 程序/数据库继续可用。不升级 schema，不替换安全复制实现。验收前菜单不能显示可用但实际为空的分享按钮。

## 第二 Windows：已做的本机检查

2026-11-05 实测：Windows 11 家庭中文版；物理内存约 13.86 GiB、当时可用约 1.33 GiB；C/D 空间约 68.57/38.14 GiB；固件虚拟化启用、HypervisorPresent=false。PATH 和常见安装位置未发现 VBox/VMware/QEMU/docker；Sandbox 可执行文件和 Hyper-V PowerShell 模块不存在。查询可选系统功能返回“需要提升”，状态记 UNKNOWN，不擅自当作已禁用。

[微软官方支持范围](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)明确 Home 不支持 Sandbox；[要求](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install)包含内存/虚拟化与可能重启。当前不破解 Home 功能、不修改宿主安全配置、不擅自关闭用户软件腾内存。没有创建/启动第二 Windows，状态 BLOCKED（资源/现成虚拟化环境/管理员步骤），不宣称部署成功。

后续优先可控的第二台现有 Windows；若必须 VM，先确保可分配 4–8 GiB 内存、足够磁盘与合法官方 Windows 镜像，再选择已审核的虚拟机平台。驱动安装/虚拟网卡/重启明确告知用户后实施。宿主与 VM 的网络模式必须记录；同机虚拟网络也不能替代跨路由/跨互联网验收。现阶段可用两个隔离浏览器上下文继续开发浏览器协议，但这不是第二台 Windows。
