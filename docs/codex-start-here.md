# 开发接续

1. 先核对 GitHub 的 `develop`、[D15 交接 PR #103](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/103) 和[互传 PR #111](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/111)。阅读 [AGENTS.md](../AGENTS.md)、[MEMORY.md](../MEMORY.md)、[当前交付](execution/ACTIVE-DELIVERY.md)、[项目状态](project-status.md)、[路线图](roadmap.md) 和 [设计](../design.md)。用户确立的 [43 项决策](product-decisions.md) 与 [P4 44 项](product/P4-confirmed-decisions-01-44-2026-10-26.md) 保留。
2. 互传开发从 `codex/d15-transfer-baseline` 接续，使用「工作01」已验收的 D15（`459558c1aad1861f418b244002f76630bcc7ff6c`）作为桌面基础。后续独立功能分支从包含对应前置工作的提交创建。正式合并遵守仓库保护规则和项目授权。
3. 先看当前实现与合成测试，再选择需要复用的原生或第三方能力。不要提交真实数据库、私人文件路径、设备码、密钥或用户截图。桌面验收使用独立的数据目录、WebView 配置和工作区登记。
4. 本机用 PowerShell 7、Node.js 24、Rust 1.99.1、Windows SDK、MSVC 和 WebView2。基础检查、界面回归及原生构建入口如下，详细步骤见[桌面主工程](../apps/desktop/README.md)。

```powershell
pwsh -NoProfile -File scripts/check-repository.ps1
pwsh -NoProfile -File scripts/build-desktop.ps1 -Browser
pwsh -NoProfile -File scripts/build-desktop.ps1 -Native
```

下一阶段先处理连接、传输与恢复；真实监听、对外发布和费用遵守原有授权。交付时写清具体提交、包哈希和实际原生验证范围。
