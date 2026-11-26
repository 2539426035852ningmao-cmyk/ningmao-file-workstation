# 设备与站点恢复

桌面在临时互传区显示连接使用本机站点或 HTTPS 站点。站点断开时保留当前房间，只暂停需要联网的发送和保存操作。站点恢复后重新刷新同一房间。网页继续允许保存已在当前页校验完毕的文件。

## 验收分层

- 桌面合成界面回归验证主动刷新发现断线、暂停发送和保存，以及恢复后继续原有收件流程。收件仍使用原生确认和文件架目录。
- Windows 候选通过原生群主建群、独立访客批准、双向写入与同名保护的回环场景。手机脚本的 Windows 群主驱动另以合成回环探针执行其原生命令。
- 电脑浏览器与 Android 14 模拟器已有 HTTPS 双向落盘、模拟 Wi-Fi 和蜂窝切换、断网以及停站重启恢复证据。[扫码验收](MOBILE-ROOM-SCAN.md)
- 浏览器已有两名在线来源依次退出后从站点同一偏移接续的自动回归。此前两台 Windows 客体的原生直传覆盖设备发现、指纹核对、顺序双向收发、取消、断开及安全重试。[双机实测](TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)
- 原生回环补测同时启动两个独立 TLS 接收器，两个上传均到达首块后才继续。两个方向均收到完成回执，编号副本的哈希分别正确，原同名文件保持原样。
- 本机 Android 软件仿真在 ADB 连接前退出。两台 Windows 虚拟客体停在实验镜像登录，回合内没有进入应用。Windows 软件与 Android 同轮、两台 Windows 客体真正同时收发均留待可登录的隔离设备重跑。

## 原生 Windows 与 Android 复跑

使用 Windows 便携候选、Node 24、Android 14 测试镜像和 Chrome。先启动独立 Android 模拟器。脚本检查 ADB 目标是模拟器，以独立工作区运行 Windows 原生候选。通过 ADB reverse 连接回环站点，使用同一邀请。电脑创建和批准，Android 通过系统文件选择器回传。两端重读保存结果，Windows 验证同名原件保持原样。

```powershell
npm --prefix apps/web run build
node apps/web/tests/android-room.mjs --native-exe "<候选 EXE>"
```

`--native-exe` 使用测试专用 ADB 回环。Android HTTPS 路径单独使用 `--https-emulator`。

原生并行回环复跑使用 `cargo test --locked --manifest-path experiments/p3-loopback/Cargo.toml two_pinned_receivers_finish_overlapping_uploads_without_overwriting`。
