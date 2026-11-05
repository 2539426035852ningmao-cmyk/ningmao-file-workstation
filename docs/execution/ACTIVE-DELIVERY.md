# 当前交付状态 · 2026-11-05（r7 核心初版，优先于下方历史记录）

## r7 · 先交付可直接试用的核心便携包

功能/包源码b960dcb2bb298557abb97029333ed91a698fd956，仍在Draft #62集成分支。独立便携ZIP D:/Ningmao-Preview-P3-P4-20261105-r7.zip，SHA256 51e06036d0223f18e00dac8dc72d4a8338144a0e6ae38b6c5b840ae4c91c749a；EXE SHA256 5423d50d17345b5ece8e903a80807563540482b16cd7e3d4440f0c19ee9451ac。未签名Windows x64 debug，已有WebView2方可启动。本地路径不是互联网下载链接。ZIP解压后双击Start-Ningmao.cmd；包内新增“使用说明.md”，源文件docs/first-preview-quickstart.md。

本轮全量128界面PASS（2.5分钟）、桌面Rust102PASS/6ignored、严格Clippy及Windows/MSI只读/便携包构建检查PASS。r7便携EXE在另一个隔离data/webview下实际启动，空架主窗/操作菜单/正常完整退出PASS，进程及对应监听0；ZIP内data/webview仍为空。没有继承成拖放、DPI、多屏、双设备或真实模型已验。旧r6/r5、用户数据未覆盖，无安装/发布/合并。

新增本机分享服务管理：只有配置全部debug组件时启用；分享时SHA256校验relay/web、按需隐藏启动并等待就绪，成功/失败/取消离开该分享作用域后结束自己的进程，释放独立临时存储。实际固定Go组件专项显式运行1PASS4.81秒，验证错误hash不启动、两服务真启动、作用域结束六端口归零/临时目录释放。首次Clippy拒绝option_env unwrap，改为明确错误传播后通过。**该服务自动管理组合尚未重做原生GUI端到端，先前4fd1e3d原生下载/取消证据仍按该SHA保留。**

为不把开发路径依赖或未清关组件交给用户，r7核心包未设置上述组件配置，浏览器分享入口隐藏，未附Go/web资产；它包含完整已有文件工作站/互传/搜索/规则与可配置AI界面，不宣称浏览器跨设备已交付。第三方清单仍408条/1既有映射警告；正式发行清关待完成。真实LAN双机、LocalSend、AI服务/费用及手机/互联网仍未验。

后续直接推进组件分发/许可、自动服务+原生GUI复测，再做双设备；用户可同时体验r7，按美术/交互/动画/操作反馈收束。回滚用旧版本独立目录，先完整退出再备份data/webview，不跨版本覆盖数据库。


## 仓库同步记录 · 2026-11-05

当前候选分支HEAD b3d0737918e42da005132371abb47ced3767d215，Desktop 42034138430、Preview 42034138440、P3回环42034138237已全部success。功能包源码仍b960dcb，新文档提交不会改变已打包二进制或继承后续CI结果。

[功能/已知问题/解决方向/PR关系](../project-status.md) · [初版使用说明](../first-preview-quickstart.md) · [原有完整执行历史](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/b3d0737918e42da005132371abb47ced3767d215/docs/execution/ACTIVE-DELIVERY.md) · [原生分享安全证据](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/00dd0275cc084f9a8e76e523439a665f36ff3f65/docs/research/browser-share-evidence/native-local.json)。历史失败、SHA与回滚点均保留在原记录，不在此重复第二套进度。

本次main文档同步基于fc8903dc3a34a17707db3a9cbd12f631baaef71b，独立docs/repository-status-sync-20261105分支；没有合并#62业务代码、发布或上传本地ZIP。主分支读者需明确：完整程序仍在候选，包在用户本地，没有永久公开下载地址。后续继续实际开发时切回feat/p3-p4-consolidated-preview-20261105核对远端，不在本纯文档分支造程序。