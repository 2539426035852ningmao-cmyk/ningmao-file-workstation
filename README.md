# 柠猫文件工作站

**Ningmao File Workstation**

Windows 10/11 优先的轻量桌面悬浮文件工作站，支持临时文件引用与真实目录两种文件架，逐步扩展跨设备互联和 AI 文件管理。

**当前 main 已合入 M1-01/02/03**，包含 GitHub 基础治理、Windows 技术基线与双 UI 原型。M1-04 已批准独立 Tauri 主工程选型；真实文件操作、预览 MSI 与引用修复分别在未合并的 Draft PR #9 → #11 → #13 中。自动测试已有成果，精确候选的 Windows GUI/安装/多屏/DPI 尚待验收；目前没有正式发行版。

**开发导航：** [Codex 从这里开始](docs/codex-start-here.md) · [设计规范 design.md](design.md) · [阶段路线图](docs/roadmap.md) · [43 项冻结决策](docs/product-decisions.md)。复杂功能放按需管理中心，日常默认是小型悬浮文件架。

已批准技术：Tauri 2、Rust、React、TypeScript、SQLite；UI 以 shadcn/ui 为主，按需复用 SpaceUI FileThumb。主工程目前位于未合并 PR，而非 main。

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
| M1-03 | SpaceUI 与 shadcn/ui 同功能原型比较 | 已验收、PR #6 已合入 |
| M1-04 | 主工程与设计系统选型 | 已批准，ADR 与代码随 Draft #9 |
| M1-05 | 真实文件功能闭环 | 候选代码 + 自动测试在 Draft #9，原生体验未完整验收 |
| M1-06 | Windows 实机验收与交付 | Draft #11 预览 MSI 与只读检查；真实安装等未测 |

详见 [M1 开发记录](docs/milestones/M1.md)、[M1-03 任务](docs/tasks/M1-03.md)与 [UI 比较报告](docs/research/M1-03-comparison.md)。全部 43 项决策继续保留。

## 仓库检查

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

Ningmao File Workstation is a Windows-first lightweight floating file shelf. The default branch contains accepted M1-01/02/03 research and UI prototypes. A Tauri-based file-operations candidate is still in draft PRs pending real Windows GUI and installer acceptance; this is not a production release. See the Chinese decision baseline for the full scope.
