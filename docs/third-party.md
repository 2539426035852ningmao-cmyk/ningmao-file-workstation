# 第三方代码与工具记录

## P0/P1 窗口尺寸记忆

复用官方[tauri-plugin-window-state 2.5.0](https://github.com/tauri-apps/plugins-workspace/tree/a2364a5f216324439feedeb25b2db74e7b1eba90/plugins/window-state)，crate的.cargo_vcs_info.json与tag window-state-v2.5.0均指向a2364a5f216324439feedeb25b2db74e7b1eba90。MIT OR Apache-2.0，选择MIT，[全文](../licenses/tauri-window-state-2.5.0-MIT.txt)从发布crate保留。精确锁定，锁文件仅新增该一个package，无升级既有依赖；原文归集268项/0缺失/原有1项映射警告。仅Rust自动SIZE保存恢复，无前端权限扩展；多屏/DPI与正常退出行为仍需精确Windows验收。未复制或修改插件实现。

核验日期：2026-10-23。主项目 Apache-2.0 不替代第三方各自许可证。

## 2026-10-24 系统默认打开

同日紧凑架候选只新增原生 Radix DropdownMenu 的薄组合层，复用已安装 radix-ui 1.8.1 / @radix-ui/react-dropdown-menu 2.2.1，MIT 文本已在既有许可归集中，无新增包或锁文件变化。只读研究 [上游实现](https://github.com/radix-ui/primitives/blob/main/packages/react/dropdown-menu/src/dropdown-menu.tsx) blob `5af14f488d45052979625b1c8c69cb8981a91a77`，用于确认 Root/Trigger/Portal/Content 与键盘接口；不复制该源码、不将 main blob 冒充 npm 2.2.1 发布提交。shadcn/SpaceUI 原始组件不改，仅在应用中组合并提供中文关闭按钮；不增加另一套主题。

- 新增直接依赖 [open 5.4.5](https://github.com/Byron/open-rs/tree/v5.4.5)，精确版本及校验和写入 Cargo.lock，MIT；保留 Sebastian Thiel 版权及完整 [许可证](../licenses/open-rs-MIT.txt)。不复制或修改库源码，没有额外 NOTICE 要求；实际分发仍由许可归集清单覆盖。
- 发布包 .cargo_vcs_info.json 指向 `a60a9d508e24417d62e924fb133aaeec0e96f222`。本机包 src/windows.rs、src/lib.rs、LICENSE.md 与 GitHub v5.4.5 tag 的 Git blob 分别核对一致：`1597d3896eead576f6c9c2b89960c4789b7c6eaf`、`1bd29bbb99bb962f77f676a7e2c5d8ad0bd76b9c`、`17daa1e3b39831093699020febfe1411247fa519`。
- 官方 [tauri-plugin-opener 2.7.2](https://github.com/tauri-apps/plugins-workspace/blob/opener-v2.7.2/plugins/opener/Cargo.toml) 同样复用 open 5 + shellexecute-on-windows；本工程只需要受 ID 约束的后端命令，因此直接复用底层库，避免增加完整插件/前端任意路径权限。启用 Windows ShellExecuteExW 路径，禁用 insecure，未提供自定义程序或 URL 接口。
- 新增锁记录为 open 5.4.5 及非 Windows 的 is-wsl 0.4.0 / is-docker 0.2.0；Windows dunce 已存在。最低 Rust 1.62，兼容本工程 1.99.1。维护成本为固定依赖的安全/兼容更新核查；不把本轮核查当成完整漏洞审计或原生用户体验验收。

2026-10-24 的手动引用重新定位仅调用已有 tauri-plugin-dialog 2.8.3 原生文件/目录选择与确认 API，后台线程等待、关联调用窗口，未复制或改库源码，无新依赖。Cargo VCS/tag 对应提交 44293a5722efcaf27060504e63b17aeba721b40f，本机 src/lib.rs 与 GitHub blob 7cfad33b1a2301c801d48ed251a1b069d9497d74 一致；MIT 原文沿用既有 licenses/tauri-dialog-MIT.txt。实现/验证边界见 [引用修复任务](tasks/reference-relocation.md)。

## M1-06 预览打包与许可归集

- 打包直接使用锁文件中的 Tauri CLI **2.12.4**；官方 tag tauri-cli-v2.12.4 对应提交 [993038c49185307dfc895ab7657d77ca0d5ed7c7](https://github.com/tauri-apps/tauri/tree/993038c49185307dfc895ab7657d77ca0d5ed7c7)。复用该版本 crates/tauri-bundler/src/bundle/windows/msi/main.wxs，不复制或修改模板。官方工具为 MIT OR Apache-2.0，工具不随应用分发。预览配置跳过 WebView2 安装引导，不生成提权更新任务，标准 per-machine 和完成页启动选项在说明中明确。
- CI artifact 使用 [actions/upload-artifact v7.0.0](https://github.com/actions/upload-artifact/tree/bbbca2ddaa5d8feaa63e36b76fdaad77386f024f)，固定 SHA；MIT，仅引用 Action、不复制源码，保留 7 天、只读仓库权限，不创建 Release。
- scripts/collect-licenses.mjs 使用 Node 标准库，按 Cargo Windows normal/no-proc-macro 依赖图及 npm 非 dev 锁记录归集原文与 NOTICE，保留相对路径、原文字节 SHA256。范围为保守超集，既不是逐字节 SBOM，也不是完整分发审计；Rust 标准库原始 COPYRIGHT-library.html 和工具链许可同样归集。
- alloc-stdlib 0.3.0 的包缺原文，从其 .cargo_vcs_info.json 对应 [0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE](https://github.com/dropbox/rust-alloc-no-stdlib/blob/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE) 原样补齐 BSD-3-Clause。
- webview2-com / webview2-com-sys 0.39.1 同样从各自 VCS 元数据对应 [edc2caf886175ccaebe86078c9cfe1ae2a187328/LICENSE](https://github.com/wravery/webview2-rs/blob/edc2caf886175ccaebe86078c9cfe1ae2a187328/LICENSE) 补入 MIT，未修改版权与条款。
- react-remove-scroll-bar 2.3.8 包声明 MIT 但不含 LICENSE。npm gitHead b3b1287aad81def2e2ae707274b74531b61ddbaf 在声明仓库查询 404；后续上游 [7301c160fda44cb8cf2b9fdfde61efad35736196/LICENSE](https://github.com/theKashey/react-remove-scroll-bar/blob/7301c160fda44cb8cf2b9fdfde61efad35736196/LICENSE) 是 2025-05-21 添加的 MIT 原文，仅作为补充声明，不能冒充精确 2.3.8 源码提交。此缺口保留在清单 warnings，正式发行前仍需核对。
- 三份原文及版本/URL/hash 映射在 licenses/package-overrides.json。仅补许可原文，没有复制这些上游项目代码，也没有修改用户未授权的仓库。传递嵌入原生组件、完整义务与正式签名/发行仍待审查。
- 安装包只读查询使用 Windows Installer OpenDatabase(mode=0)，依据 [Microsoft 原始 API 说明](https://learn.microsoft.com/en-us/windows/win32/msi/installer-opendatabase)。不调用安装、卸载或 Commit；结构检查不能证明实际卸载行为。

## M1-04 / M1-05 主工程来源

主工程 apps/desktop 复用本仓已验收 M1-02 B 模板与 M1-03 组件，而非另造通用控件。6 个 shadcn/ui 组件、1 个 SpaceUI FileThumb 源码不改，移入主工程路径，逐文件来源和 SHA256 见 [source-provenance.json](../apps/desktop/source-provenance.json)。主工程只使用 shadcn 主题，未加载第二套 SpaceUI tokens。

| 依赖 | 锁定版本 | 原始许可与义务、实际使用范围 |
|---|---|---|
| rusqlite / libsqlite3-sys | 0.40.2 / 0.38.2，bundled SQLite | rusqlite MIT 原文见 licenses/rusqlite-MIT.txt；SQLite 本体公有领域，包装与传递库各有许可，不用一个主许可证覆盖全部 |
| tempfile | 3.27.0 | MIT OR Apache-2.0，选择 MIT，保留 licenses/tempfile-MIT.txt；使用随机暂存及 persist_noclobber，不修改库源码 |
| image | 0.25.10 | MIT OR Apache-2.0，选择 MIT，保留 licenses/image-MIT.txt；仅启用 png/jpeg/webp，有限额解码，不引入完整默认格式集 |
| tauri-plugin-dialog | 2.8.3 | MIT OR Apache-2.0，选择 MIT，保留 licenses/tauri-dialog-MIT.txt；仅后端调用官方原生选择器，未给前端通用文件系统写权限 |
| drag-rs / Tauri / dnd-kit / TanStack / Radix / Lucide 等 | 锁文件为准，drag 2.1.0 | 沿用已核验来源与原始许可，实际副本全文在 licenses/；Windows Copy、pointer 排序、虚拟化均复用成熟实现 |

[Windows Cargo 281 条元数据](research/m1-05-evidence/cargo-license-metadata.json)与 [npm 189 条元数据](research/m1-05-evidence/npm-license-metadata.json)初筛无缺失/GPL/AGPL 字段；含可选平台依赖，不等于实际发行包清单。未宣称完整漏洞或法律审计通过，签名安装和公共二进制发布前仍须逐项核对传递许可、NOTICE 与实际打包内容。本轮不创建公共 Release。

| 项目 | 用途 / 状态 | 固定版本 | 原始许可与义务 | 修改与风险 |
|---|---|---|---|---|
| [actions/checkout](https://github.com/actions/checkout) | CI 获取代码，已使用 | v7.0.1 / `3d3c42e5aac5ba805825da76410c181273ba90b1` | [MIT](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/LICENSE)；仅引用 Action，未复制源码，原许可由上游保留 | 未修改；Node 24，使用 GitHub 托管 Windows/Ubuntu runner；固定 SHA、只读权限、禁持久凭据；Dependabot 每周检查 |
| [GitHub CLI](https://github.com/cli/cli) | 本地初始化工具，不随应用发布 | v2.103.0 / windows_amd64.zip | [MIT](https://github.com/cli/cli/blob/v2.103.0/LICENSE)；工具未提交本仓库 | 官方发布便携包，SHA256 `80c846a5b8432672ca6373b34ce9de998c9686aaa1885c845f2e1ee81f713726` 与 release digest 一致；不复制凭据 |
| [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) | 主仓库 LICENSE | SPDX Apache-2.0 | 从 [GitHub 许可证 API](https://api.github.com/licenses/apache-2.0)获取标准全文 | 未修改许可条款；目前没有需要继承的第三方 NOTICE 内容 |

## M1-03 实际 UI 来源

以下只用于实验，不代表批准最终设计系统。逐文件原始 SHA256 和改动见 [source-provenance.json](../experiments/m1-03/source-provenance.json)。

| 来源 | 固定版本/范围 | 许可与修改、维护风险 |
|---|---|---|
| [SpaceUI](https://github.com/spacedriveapp/spaceui/tree/a48b17047d3ff1d05268acb6f88a79460ad4fa7b) | `a48b17047d3ff1d05268acb6f88a79460ad4fa7b`；Button/Input/Tabs/ContextMenu/Badge/GridItem/FileThumb/TagPill 及 2 个 token 文件 | MIT，保留 Copyright 2024 Spacedrive [全文](../experiments/m1-03/licenses/spaceui-MIT.txt)。两个组件做聚合导入/data-selector 适配；宿主调整对比度、字体。实际源码少于 README 所述组件范围；不引入整个应用级 Dialog 管理器和无关依赖 |
| [shadcn/ui](https://github.com/shadcn-ui/ui/tree/3d98900e9b73c45f035f8109e9d41ba6a51685e7) | `3d98900e9b73c45f035f8109e9d41ba6a51685e7`；new-york-v4 Radix 版本 button/input/tabs/context-menu/sheet/badge | MIT，保留 Copyright 2023 shadcn [全文](../experiments/m1-03/licenses/shadcn-MIT.txt)。组件源码不改；cn 模块通过 alias 连接 clsx/tailwind-merge；选定版本不等于把未核实的迁移传言当结论 |
| [dnd-kit](https://github.com/clauderic/dnd-kit) | core 6.3.1、sortable 10.0.0、utilities 3.2.2 | MIT，[原始许可](../experiments/m1-03/licenses/dnd-kit-MIT.txt)；使用稳定 npm 版本，非将当前仓库 main 冒充这些发布源码；基于 pointer 排序，原生环境仍需单独实测 |
| [TanStack Virtual](https://github.com/TanStack/virtual) | @tanstack/react-virtual 3.14.22 | MIT，[原始许可](../experiments/m1-03/licenses/tanstack-virtual-MIT.txt)；两套共用，React 19 关闭 useFlushSync，固定行高并记录真实挂载量 |
| Radix / Lucide / Phosphor / Tailwind / React / Playwright 等 | npm 锁文件固定；[190 条元数据清单](research/m1-03-evidence/npm-license-metadata.json)含可选平台记录 | 各自许可保留在包内；初筛无缺失或 GPL/AGPL 字段，不等于全部二进制分发/漏洞审计。Playwright 仅为开发测试工具，无用户登录浏览器会话 |
| [actions/setup-node](https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1) | v7.1.0 / `949feb2413d6458794dcd2491c4babbbce0c15c1` | MIT；仅引用 Action，固定 SHA，Node.js 24；与只读 checkout 配合，不持久化 GitHub 凭据 |

M1-03 原生后端及模板源自本仓 M1-02，create-tauri-app/drag-rs MIT 全文同样保留在本实验 licenses/。Cargo 锁版本沿用 M1-02，完整传递许可与 NOTICE 审核仍属于正式分发前工作。当前没有公共二进制 Release。

## M1-02 实际来源及使用范围

| 来源 | 固定版本与路径 | 许可和署名 | 修改、兼容性与维护成本 |
|---|---|---|---|
| [Holdem](https://github.com/iamzubin/holdem/tree/35644fe0f1c4eeda4c9bd4deb02bb7b8b4b6b734) | `35644fe0f1c4eeda4c9bd4deb02bb7b8b4b6b734`，3.1.1；源码只取到本地忽略目录，不复制完整源码进主仓 | MIT，Copyright 2024 Zubin Choudhary；原文留在 [holdem-MIT.txt](../experiments/m1-02/licenses/holdem-MIT.txt) | 原生源码不改；仅构建配置覆盖和隔离运行；含自带 drag-patch、更新、自启和分析依赖；默认拖出可移动来源，主工程不能原样直接采用。尚未完成全部传递依赖分发审计 |
| [create-tauri-app](https://github.com/tauri-apps/create-tauri-app/tree/16a754703baf0ca40fd4462dfc7674bc99bf3ef3) | npm 4.7.5 / commit `16a754703baf0ca40fd4462dfc7674bc99bf3ef3`；模板生成于 `experiments/m1-02/tauri-baseline` | MIT OR Apache-2.0，选择 MIT；[原始许可](../experiments/m1-02/licenses/create-tauri-app-MIT.txt)保留 Tauri Programme 版权 | 改为技术探针、双窗口、合成素材、原生拖出、日志；移除 opener；模板图标仅用于探针，不是产品品牌；源码及 npm/Cargo lockfile 保留。原生接收与 HTML 排序存在实测冲突 |
| [drag-rs](https://github.com/crabnebula-dev/drag-rs) | Cargo crate `drag = 2.1.0`（精确锁定）；当前上游 v2 分支研究快照 `585b2fcba3dc80908e59a3620af4fe9090491a00`，不把分支最新 SHA 冒充 crate 发布 SHA | MIT OR Apache-2.0，选择 MIT；[原始许可](../experiments/m1-02/licenses/drag-rs-MIT.txt)保留 CrabNebula 版权 | B 直接作为依赖、不改库源码；Windows OLE 强制 Copy 已实测。A 自带 patch 的 `.cargo_vcs_info` 上游来源为 `a567d08a539df85c88f05f8921153d2a78b426a3`，有 CopyOrMove 扩展，不能与未修改 crate 混淆 |
| Tauri / Rust 及前端传递依赖 | 以提交的 Cargo.lock / package-lock.json 为准 | [B Windows Cargo SPDX 元数据清单](research/m1-02-dependency-licenses.json)记录 262 个包的名称、版本、license、repository | 元数据初筛没有 GPL/AGPL 或缺失许可字段，不等于完成全部法律/漏洞审查。正式二进制发布前仍须收齐实际许可文本、NOTICE，审核 npm 依赖和可选平台组件 |
| Rust 工具链 | 本机 1.99.1；官方 rustup-init SHA256 `00f139da614dced87d3c3d4121c43eebdac3c1bf8a5ee86b9d80dfd71c8d70fd` | 官方开发工具，不打包进产品 | 安装在本地工作目录，未改全局 PATH；rustc/cargo/std 校验官方 manifest SHA256；不上传工具链和代理配置 |

保留直接来源 MIT 全文后，不新增没有实际来源要求的虚假 NOTICE。传递包中的 NOTICE 和其他义务仍需在正式发布前核对；当前不发布公共二进制 Release。完整试验范围见 [比较报告](research/M1-02-comparison.md)。
