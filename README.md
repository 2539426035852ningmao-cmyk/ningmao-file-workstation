# 柠猫文件工作站

**Ningmao File Workstation**

Windows 10/11 优先的轻量桌面悬浮文件工作站，支持临时文件引用与真实目录两种文件架，逐步扩展跨设备互联和 AI 文件管理。

当前交付范围为 **M1-02：双技术基线验证**。仓库包含可构建的 Windows 技术样机；尚无正式产品或发行版本。基础 CI 与原生拖放的实机结果分别记录。

候选技术：Tauri 2、Rust、React、TypeScript、SQLite。最终主工程需经双基线验证与用户验收确定。

主仓库许可证为 [Apache-2.0](LICENSE)，官方发行版计划永久免费。第三方组件保留各自许可证。

## 已确认的产品方向

- 临时文件架默认仅保存引用；真实目录文件架拖入默认复制，保留来源。
- 支持多标签、独立悬浮窗口、托盘、贴边收起及多显示器适配。
- 保留预览、排序、分组、标签、搜索、管理中心等全部既定需求。
- 跨设备互联、浏览器插件与 AI/API 属于后续阶段；M1 先验证真实 Windows 文件闭环。
- 不静默覆盖、不擅自移动原文件；移除引用不删除原文件。

[43 项冻结决策](docs/product-decisions.md)是需求索引，[M1 原始执行基线](docs/m1-execution-baseline.md)保留交接细节。不得将本 README 的摘要当作需求删减。

## 开发阶段

| 任务 | 范围 | 状态 |
|---|---|---|
| M1-01 | 仓库、文档、模板、基础 CI、main 保护 | 已完成，Issue #1 已关闭 |
| M1-02 | Holdem 与独立 Tauri 2 模板真实技术对比 | 已有双构建及实机证据；存在兼容问题和未测项，待验收 |
| M1-03 | SpaceUI 与 shadcn/ui 同功能原型比较 | 未开始 |
| M1-04 | 主工程与设计系统选型 | 未开始，需用户批准 |
| M1-05 | 真实文件功能闭环 | 未开始 |
| M1-06 | Windows 实机验收与交付 | 未开始 |

详见 [M1 开发记录](docs/milestones/M1.md)、[M1-02 任务](docs/tasks/M1-02.md)与 [技术比较报告](docs/research/M1-02-comparison.md)。全部 43 项决策继续保留。

## 仓库检查

安装 Git 和 PowerShell 7 后，在仓库根目录执行：

```powershell
pwsh -NoProfile -File scripts/check-repository.ps1
```

GitHub Actions 在 Windows 和 Ubuntu 上运行基础检查，另设 Windows A/B 原生构建工作流。Windows 本机构建与复测命令：

```powershell
pwsh -NoProfile -File scripts/m1-02/build-baselines.ps1 -Baseline Both
```

环境、锁定版本和合成文件操作步骤见 [基线 B 说明](experiments/m1-02/tauri-baseline/README.md)。A 原版同盘拖出可能移动来源；只用于专用合成文件测试。尚未进入 M1-03 UI 对比或 M1-05 正式文件功能。

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[AGENTS.md](AGENTS.md)、[行为准则](CODE_OF_CONDUCT.md)与 [安全政策](SECURITY.md)。文档入口见 [docs/](docs/README.md)。

## English

Ningmao File Workstation is a Windows-first floating file workstation. M1-02 contains research prototypes, reproducible Windows builds and measured limitations. It is not a production release or an approved architecture. See the Chinese decision baseline for the full scope.
