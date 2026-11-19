# 两台 Windows 虚拟机的安装版互传验收

2026-11-20，应用以 D15 接续分支的 `14584f6` 为源码。使用 QEMU 11.1.0 的 TCG 软件仿真，在两台 Windows 10 Enterprise LTSC 2021 客体的正常桌面运行工作站。微软评估 ISO 的 SHA-256 为 `e4ab2e3535be5748252a8d5d57539a6e59be8d6726345ee10e7afd2cb89fefb5`。[微软镜像校验表](https://download.microsoft.com/download/c/1/1/c11d2ca5-967c-45c0-bc7d-2d9ca3f1fe07/Windows10Enterprise22H2HashValues.pdf)

客体 A 从微软安装程序完成系统安装。客体 B 在测试开始前复制系统磁盘，使用独立虚拟磁盘、UUID、网卡 MAC 与机器名，并在自己的系统中卸载后重新安装同一 MSI。两台报告 Windows 10.0.19044 和 MSI 安装状态 0。每台用独立工作区、WebView2 配置、收件目录及房间成员身份。实验桌面带 Windows 评估许可证过期水印。

MSI 的 SHA-256 为 `a8ad4f63b806ea0db53eb437f341628e03768c89fd9ffb0ce748e51471cdab5e`。从 MSI 的 app.cab 提取 File 表中的主程序，与两台实际安装的 EXE 分别比对，SHA-256 均为 `63810041c62a90130db35192a2bca44caadbcd61148a0cc5728d7d86c349bf00`。包外 EXE 与内嵌 EXE 有三字节差异，位于 Tauri 的包类型标记，分别为 UNK 和 MSI。

## 复测顺序

1. 在两套独立 Windows 工作区安装同一预览 MSI。站点启用分块存储并采用信任链有效的 HTTPS。两台用同一邀请加入，独立选择绑定收件目录。
2. A 发送 4,194,577 字节的合成文件。测试站点在上传偏移 4,194,304 字节时关闭一次连接。以相同任务编号重试，站点从该偏移继续，重复请求仍只显示一个文件。
3. 关闭 A 后，B 先拒收再确认。测试站点在下载范围 `bytes=4194304-4194576` 时关闭一次连接，B 从同一范围重试。目标目录已有同名文件，落盘副本为 `native-a (1).txt`。旧文件内容保留，副本的重读 SHA-256 与 A 源文件一致，为 `daa66055a9d885e318dc4aa03d26dcd8b74d994c9eef9112e2ec9a1628bb4ce8`。
4. B 发回等大小的另一份合成文件并关闭。A 重启后重用原有房间身份，打开同一互传区确认后保存为 `native-b (1).txt`，原同名文件未改动。A 重读落盘文件的 SHA-256 为 `5f47293fce1644c6e4dfded10c67ef48ddaf22b1d427b828112a18ab2e5ad6b8`，与 B 源一致。站点记录两台各一个成员身份。

本次使用同一宿主上的两个 QEMU 客体及虚拟 NAT，两台交替运行，站点绑定宿主回环地址，并在两台切换期间持续提供暂存。原生对话框仍使用「网页传来」的旧文案，即使发送端是 Windows。这次双客体场景使用 4 MiB 加 273 字节的文件，20 GB 证据见[原生回环验收](TEMPORARY-ROOM-NATIVE-BULK-ACCEPTANCE.md)。物理双机局域网发现与真实跨网仍待独立验证。
