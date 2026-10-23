# 柠猫文件工作站

**Ningmao File Workstation**

Windows 10/11 优先的轻量桌面悬浮文件工作站，支持临时文件引用与真实目录两种文件架，逐步扩展跨设备互联和 AI 文件管理。

M1-01～M1-03 已获用户验收。M1-04 已批准独立 Tauri 2 主工程与 shadcn/ui 主设计系统；当前在 **M1-05** 实施真实文件引用、SQLite、目录绑定、安全复制与原生拖出，尚无正式发行版本。浏览器、CI 和原生实机证据分别记录。

已批准技术：Tauri 2、Rust、React、TypeScript、SQLite；唯一主工程 [apps/desktop](apps/desktop/README.md)。选型见 [ADR 0001](docs/decisions/0001-main-engineering.md)。

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
| M1-02 | Holdem 与独立 Tauri 2 模板真实技术对比 | 已验收、PR #4 已合入；已知问题和未测项保留 |
| M1-03 | SpaceUI 与 shadcn/ui 同功能原型比较 | 已验收，PR #6 已合入，Issue #5 关闭 |
| M1-04 | 主工程与设计系统选型 | 用户已批准推荐方案，见 Issue #7 |
| M1-05 | 真实文件功能闭环 | 当前任务，见 Issue #8 |
| M1-06 | Windows 实机验收与交付 | 预览 MSI 已构建，后台安全/交付检查持续完善，见 Issue #10 / PR #11；原生与安装未验收 |

详见 [M1 开发记录](docs/milestones/M1.md)、[M1-03 任务](docs/tasks/M1-03.md)与 [UI 比较报告](docs/research/M1-03-comparison.md)。全部 43 项决策继续保留。

## 主工程与检查

主工程使用 scripts/build-desktop.ps1 -Native / -Browser 构建和验证，详见 [运行说明](apps/desktop/README.md)与 [M1-05 验证记录](docs/research/M1-05-verification.md)。默认只运行后台/headless 测试，不自动弹出原生测试窗口；原生体验另约时间集中验收。

安装 Git 和 PowerShell 7 后，在仓库根目录执行：

```powershell
pwsh -NoProfile -File scripts/check-repository.ps1
```

GitHub Actions 在 Windows 和 Ubuntu 上运行基础检查，另设 Windows A/B 原生构建工作流。Windows 本机构建与复测命令：

```powershell
pwsh -NoProfile -File scripts/m1-02/build-baselines.ps1 -Baseline Both
```

M1-03 的 Windows 构建与浏览器验证分别执行 `scripts/m1-03/build-ui.ps1 -Native` 和 `-Browser`，详见 [双 UI 样机说明](experiments/m1-03/ui-comparison/README.md)。M1-02 的 A 原版同盘拖出可能移动来源，只用于专用合成文件测试。M1-03 允许明确标注的合成素材，不等于 M1-05 正式文件功能。

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[AGENTS.md](AGENTS.md)、[行为准则](CODE_OF_CONDUCT.md)与 [安全政策](SECURITY.md)。文档入口见 [docs/](docs/README.md)。

## English

Ningmao File Workstation is a Windows-first floating file workstation. M1-03 was accepted. The approved main application uses Tauri 2, Rust, React, TypeScript, SQLite and shadcn/ui, with selected licensed SpaceUI components. M1-05 implements the first real file workflow; native acceptance and a production release are still pending. See the Chinese decision baseline for the full scope.
