# Android 临时互传隔离验收

GitHub 公开仓库使用普通 Ubuntu 运行器和 KVM 启动 Android 14 x86_64，测试内使用 adb reverse 将站点回环地址送入 Android。合成文件用 Android 原生文档选择器授权读取，使用 Android Chrome 实际发出。收件保存到 Android 的 Downloads 目录，ADB 从该目录重读 SHA-256。相机权限提示选择拒绝。

2026-11-19 首次通过的 Android 工作流运行编号为 44497862546。Android 发出的 4,194,381 字节文件，站点独立复取的 SHA-256 为 `35d4b17b57378bc5638e739173b372736e55f26bbcf14659a6290b8497d1c8d4`。Android 收到的 187 字节文件，Downloads 目录重读 SHA-256 为 `efaab626e4f76e9c0dc7da7cbb8be0cdb406aabc8e9e4332890a8d81223a9c7c`。[实测日志](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/44497862546/job/135469554536)

复测使用 `npm run build` 生成网页，启动一个装有 Chrome 的独立 Android 模拟器，再从仓库根目录运行 `node apps/web/tests/android-room.mjs`。脚本建立独立合成数据目录与回环转发，自行清理。同次复测核对了亮屏供件、休眠、唤醒。系统休眠后 Android 从供件名单退出，站点提供的文件哈希一致。唤醒后供件保持关闭，经过点击后才重新登记。

用 `--emulator-network` 追加独立的模拟网络测试。Chrome 通过模拟器专用宿主地址访问同一站点。测试仅为这一个临时地址开启浏览器安全上下文例外，站点仍绑定回环。Android 系统报告默认线路依次为虚拟 Wi-Fi、虚拟蜂窝、虚拟 Wi-Fi，Chrome 在每一种线路上均从站点取回合成文件并核对哈希。[最新完整日志](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/44500915236/job/135480131791)

本机 Windows 环境用官方 Android SDK 模拟器软件模式启动时 ADB 持续离线。此处成功证据来自 GitHub 运行器上的 Android 虚拟设备。Android 大文件、跨运营商网络、iOS 和站点离线自治仍待验证。
