# 贡献指南

感谢参与柠猫文件工作站。先阅读 [43 项决策](docs/product-decisions.md)、[M1 基线](docs/m1-execution-baseline.md)与 [AGENTS.md](AGENTS.md)。当前在已批准主工程 apps/desktop 推进 M1-05 真实文件闭环。执行 scripts/build-desktop.ps1 -Native / -Browser 验证，原生体验单独实测。

## 工作流程

1. 在 Issue 中关联明确任务；检查已有 Issue、源码及成熟开源实现，避免重复开发。
2. 从最新 main 创建独立分支，一个 PR 尽量只解决一个可验收问题。
3. 使用合成文件验证，禁止提交私人素材、凭据、实际工作数据库和本地机密路径。
4. 运行相关检查，填写 PR 模板并记录回滚方式。
5. 经 CI 和适用的验收后合并。真实文件安全、架构调整、最终 UI 方向不得自动合并。

main 要求 PR、基础检查和对话解决；初始化阶段不要求第二位审核人，避免单人维护无法自行批准 PR。后续增加协作者时再评估审核人数。

## 当前检查

需要 Git 和 PowerShell 7：

```powershell
pwsh -NoProfile -File scripts/check-repository.ps1
```

检查必需文件、UTF-8、被跟踪的本地数据/构建产物、常见 GitHub 凭据与私钥，以及 Git 空白错误。这只是基础防线，不是完整秘密检测器；提交前必须人工核对 `git diff --cached`。

基础检查在 `windows-latest` 与 `ubuntu-latest` 上运行；M1-02 另有 Windows A/B 构建。改动 B 样机时运行 `scripts/m1-02/build-baselines.ps1 -Baseline B`，包含 TypeScript 构建、Rust 格式、测试、Clippy 和原生构建。原生文件交互仍须单独实机验证。

## 第三方代码

M1-03 运行 `scripts/m1-03/build-ui.ps1 -Browser` 验证构建、模型行为、两套 UI 交互与虚拟列表；Windows 构建追加 `-Native`。浏览器测试不能代替启用 Tauri 原生接收后的实机排序验证。固定来源的复制组件修改需同步 source-provenance.json。

引入前在 [第三方清单](docs/third-party.md)记录来源、固定版本、许可、修改、署名/NOTICE 义务、兼容性和风险。保留必要原始版权和许可证；主仓库 Apache-2.0 不会自动替代第三方许可证。

## 安全与社区

安全问题请按 [SECURITY.md](SECURITY.md)私下报告，不在公开 Issue 上传敏感细节。参与协作须遵守 [行为准则](CODE_OF_CONDUCT.md)。
