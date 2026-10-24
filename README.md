# 柠猫文件工作站

**Ningmao File Workstation**

Windows 10/11 优先的轻量桌面悬浮文件工作站，支持临时文件引用与真实目录两种文件架，逐步扩展跨设备互联和 AI 文件管理。

目前没有正式稳定发行版。main保留已验收的M1-01～M1-03及设计/AI规范；本分支 `integration/v0.1-p0-p1` 收束#9→#28全部功能及最新main规范，准备一次P0/P1集中验收。自动检查、原生交互与安装验收分别记录。

已批准技术：Tauri 2、Rust、React、TypeScript、SQLite；唯一主工程 [apps/desktop](apps/desktop/README.md)。选型见 [ADR 0001](docs/decisions/0001-main-engineering.md)。

开发入口：[当前状态与交接](docs/codex-start-here.md) · [设计合同](design.md) · [完整路线](docs/roadmap.md) · [项目记忆](MEMORY.md) · [正式总执行指令](docs/execution/v0.1-p0-p4-2026-10-24.md)。后续以完整桌面闭环和受控集成候选为单位，不再重复比较框架或堆积微小功能PR。

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
| M1-05 | 真实文件功能闭环 | #9/#11/#13/#21至#28已在受控集成候选，见Issue #8；精确原生验收仍待完成 |
| M1-06 | Windows 实机验收与交付 | r8历史候选34浏览器/18Rust及打包通过；当前阶段候选需重新验证，不能继承原生或安装结论 |

详见 [M1 开发记录](docs/milestones/M1.md)、[M1-03 任务](docs/tasks/M1-03.md)与 [UI 比较报告](docs/research/M1-03-comparison.md)。全部 43 项决策继续保留。

具体功能补充：[手动重新定位失效引用](docs/tasks/reference-relocation.md)（Issue #12），保留 ID、标签与手动顺序，只修改引用。实现与自动检查单独记录，真实系统选择器及精确候选原生验收仍待完成。

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
