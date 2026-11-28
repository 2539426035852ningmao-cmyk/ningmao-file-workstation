# 手机扫码加入临时互传区

电脑上的网页或 Windows 软件用手机可访问的自托管 HTTPS 站点建群。勾选「入区需批准」，展开「手机扫码加入」。手机系统相机扫码后，在浏览器填显示名称、申请加入。电脑批准后，双方从「发送文件」和「共享文件」双向收发。二维码和复制邀请使用同一个链接，在显示端本地生成。

Windows 的「本机互传站点」服务于当前电脑。手机扫码使用单独配置、手机可访问并信任其证书的 HTTPS 地址。自托管站点仍由用户选择启动，对外接入沿用原有配置。旧版其它互传区操作继续适用。

## 验收

2026-11-26，用户确认扫码入群和双向收发通过。[草稿 PR #117](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/117)记录 Windows 候选和 GitHub 五项成功检查。Android 14 模拟器完成同一邀请经审批后的实际双向落盘，文件哈希一致，断网和停站重启后可重新进入。[模拟器日志](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/45728962902/job/139605895283)

- 网页回归解码电脑实际绘制的二维码，逐字比较原邀请，再以独立移动视口打开、申请和获批。回环 HTTP 站点只给出地址说明。
- Windows 桌面界面回归从已建群入口展开二维码，保留复制邀请与原有审批入口。
- Android 14 模拟器脚本在电脑 Chromium 界面建群，从二维码像素解码后把同一地址交给 Android Chrome，验证批准前不可见共享文件、电脑点击批准、手机系统选择文件和双向保存。两端核对 SHA-256。测试使用隔离网络和一次性 CA，二维码像素解码替代物理相机对准屏幕。
- Windows 软件与 Android 的同轮联测、实体手机相机及实际同 Wi-Fi 仍待验证。

```sh
npm --prefix apps/web run build
npm --prefix apps/web run test:browser
node apps/web/tests/android-room.mjs --https-emulator
```
