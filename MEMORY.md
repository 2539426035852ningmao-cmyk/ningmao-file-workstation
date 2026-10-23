# 项目交接记忆

更新：2026-10-24。此文件是继续工作的索引；以源码、精确构建与任务证据为准，不覆盖冻结需求。

## 必须先读

- [AGENTS.md](AGENTS.md)、[43 项冻结决策](docs/product-decisions.md)、[原始执行基线](docs/m1-execution-baseline.md)
- 默认分支的 [设计规范](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/main/design.md)、[开发入口](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/main/docs/codex-start-here.md)、[完整路线](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/main/docs/roadmap.md)
- 设计与路线本次核对来源 main `8ca3064f2fec063bbacc0fd7df8dfb541138163f`；候选代码采用堆叠 PR，旧分支文件不代表 main 的完整文档。

## 当前真实状态

- M1-01/02/03 已验收；M1-04 技术选择获准。唯一主工程 apps/desktop，Tauri 2/Rust/React/TypeScript/SQLite；shadcn/ui 主系统、SpaceUI 仅 FileThumb。
- Draft #9 → #11 → #13 分别负责真实文件闭环、预览打包、手动失效引用修复。#13 底座 `1cfefeaa1a2e33bddb91041d9ead45492c775461`，15 项 Rust / 5 项浏览器检查通过；这些候选没有自动合并。
- [Issue #20](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/20)：独立分支 fix/default-file-opening 修复双击默认打开/空格预览，记录见 [任务](docs/tasks/default-file-opening.md)。新候选不能继承旧二进制的原生验收结论。
- [Issue #17](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/17) / Draft #19：Gemini 接入未恢复，模型请求为 0；既有代理 HTTPS 可达，但当前实际权限仍 never、登录/Pro/额外点数关闭状态未确认。不能宣称双 AI 审查通过。
- 用户要求接入受阻时优先继续产品；不绕过策略，不因插件故障阻断所有开发，合并前独立审查与文件安全门槛仍保留。

## 完整制作顺序

按 main/roadmap：P0 真实文件基础及精确候选安全验收 → P1 紧凑悬浮文件架 → P2 悬浮球/贴边/Dock/多窗口和管理中心 → P3 局域网后远程 → P4 经授权的 AI/插件。全部 43 项需求保留；不以当前纵向闭环冒充 V0.1 完成。

近期先完成双击交互修复的自动验证与候选记录，再继续 #15 的独立紧凑 UI 原型。设计建议值仍需验收，禁止混入复制/SQLite/原生拖放重写。

## 必须一直保留的边界

- 后台工作：不启动可见候选、安装器、资源管理器，不操作鼠标键盘；重任务优先云端。仅用户明确方便时集中原生验收。
- 临时架仅引用；绑定目录默认复制、冲突编号；移除引用不删除来源；失效/离线保留分类。禁止上传私人素材、数据库、凭据或原始账号日志。
- 精确 Windows 候选的系统默认打开/取消/关联失败、真实拖入拖出/排序、安装卸载、DPI/多屏等仍待验收；headless/CI 不代替它们。
- 不自动合并 #9/#11/#13 或后续高风险功能；不覆盖旧候选。回滚使用对应 PR revert，禁止删除用户数据或旧环境。
