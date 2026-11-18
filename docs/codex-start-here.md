# 开发接续

1. 从 `develop` 拉取最新状态。先读 [AGENTS.md](../AGENTS.md)、[当前交付](execution/ACTIVE-DELIVERY.md)、[项目状态](project-status.md)、[路线图](roadmap.md) 和 [设计](../design.md)。用户确立的 [43 项决策](product-decisions.md) 与 [P4 44 项](product/P4-confirmed-decisions-01-44-2026-10-26.md) 保留。
2. 从 `develop` 创建独立功能分支和 PR。历史 `main`、旧截图和早期候选只用于追溯；下一阶段不从旧 P2/r21 快照开工。
3. 先看当前实现与合成测试，再选择需要复用的原生或第三方能力。不要提交真实数据库、私人文件路径、设备码、密钥或用户截图。桌面验收使用独立的数据目录、WebView 配置和工作区登记。
4. 本机用 PowerShell 7、Node.js 24、Rust 1.99.1、Windows SDK、MSVC 和 WebView2。基础检查、界面回归及原生构建入口如下，详细步骤见[桌面主工程](../apps/desktop/README.md)。

```powershell
pwsh -NoProfile -File scripts/check-repository.ps1
pwsh -NoProfile -File scripts/build-desktop.ps1 -Browser
pwsh -NoProfile -File scripts/build-desktop.ps1 -Native
```

下一阶段先处理连接、传输与恢复；真实监听、对外发布和费用遵守原有授权。交付时写清具体提交、包哈希和实际原生验证范围。
