# 柠猫文件工作站 · Ningmao File Workstation

Windows 优先、免费开源、本地优先的轻量文件工作站。

**2026-11-05：已提供 r7 核心便携测试包；主程序仍在未合并的候选 PR，尚无正式稳定 Release。** 不把本地试用包、代码实现或 CI 成功等同于正式发布。

[当前交付与精确证据](docs/execution/ACTIVE-DELIVERY.md) · [功能与问题总览](docs/project-status.md) · [初版使用说明](docs/first-preview-quickstart.md) · [设计规范](design.md) · [文档导航](docs/README.md)

## 现在可以做什么

| 能力 | 候选已实现内容 | 证据边界 |
|---|---|---|
| 文件工作站 | 引用收集、绑定目录安全复制、同名编号、来源保留、多选、排序、预览、默认打开 | 自动化及历史原生子集；r7未重做全部拖放场景 |
| 桌面入口 | 原创双眼球、胶囊、轻预览、Dock、多架与管理中心 | 有分版本原生证据；多DPI/多屏未完成全矩阵 |
| 局域网互传 | 显式地址/证书指纹、批次确认、校验、取消及任务记录，默认不监听 | 真实回环及本机私有网卡子集；双机/LocalSend未验 |
| 本地检索与整理 | 当前架/跨架搜索、元数据筛选、重复比较、规则标签建议 | 本地候选能力；不默认扫描全盘或下载模型 |
| AI 对话 | 兼容服务配置、多轮历史、流式回复、停止，Windows密钥保护 | 真实服务/额度未代验，需自行配置，可能收费 |
| 浏览器分享 | 开发构建已完成原生GUI→实际浏览器下载/取消→任务持久化 | 仅本机；组件未随r7分发，入口默认隐藏 |
| 插件/智能工作流 | 有冻结设计及部分基础接口/规则能力 | 不宣称已交付完整插件生态或通用自主Agent |

## 如何试用 r7

用户开发机已生成独立便携ZIP，来源提交 `b960dcb2bb298557abb97029333ed91a698fd956`。**公开仓库当前没有永久软件下载链接**；本地包位置及SHA256见[交付记录](docs/execution/ACTIVE-DELIVERY.md)。解压到新可写目录后双击 `Start-Ningmao.cmd`，需Windows x64和已有WebView2。未签名测试版，不建议当前安装MSI。

数据只在便携目录 `data` / `webview`。完整退出后备份，旧r6/r5保留；不要互相覆盖数据库。原43项产品决定与P4独立44项仍保持冻结。

## 代码在哪里

当前集成：[Draft PR #62](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/62)，分支 `feat/p3-p4-consolidated-preview-20261105`。它整合 #60 的面板与 #61 的分享后端，依赖 #57/#59 及此前 P2 候选链。**所有功能PR仍未合并；从main拉取不能得到完整桌面应用。**

最新核验的候选记录提交 `b3d0737918e42da005132371abb47ced3767d215` 的 [Desktop](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42034138430)、[Preview](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42034138440)、[P3回环](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42034138237) CI均成功。该结果不继承给后续提交。

r7本机128项界面测试、102项Rust通过/6项跳过；真实服务生命周期专项另行执行通过，便携程序启动与正常退出通过。完整Windows兼容、安装升级/卸载、双设备与真实模型仍待验。

## 接下来解决什么

1. 浏览器组件许可/资源分发及自动服务与原生GUI的组合复测，再推进双设备/HTTPS。
2. 真实LAN双机、官方LocalSend互通、DPI/多屏及真实模型专项验收。
3. 逐步精简长菜单和重复入口，保留已有能力与文件安全语义。
4. 按依赖和审批完成候选收束，不绕过保护、不自动发布。

[已知问题、优先级与解决方向](docs/project-status.md#已知问题与解决方向) · [开发接续](docs/codex-start-here.md) · [长期路线](docs/roadmap.md) · [贡献](CONTRIBUTING.md)

技术：Tauri 2 / Rust / React / TypeScript / SQLite，shadcn/ui / Radix / Lucide。主仓库Apache-2.0，第三方组件独立审核。删除、回收、真实文件变更和网络/费用授权边界不因版本推进而放宽。
