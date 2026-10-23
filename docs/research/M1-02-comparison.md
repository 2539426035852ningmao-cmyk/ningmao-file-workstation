# M1-02 · Holdem 与独立 Tauri 2 基线比较

核验日期：2026-10-23，Asia/Hong_Kong。仅技术验证，不是正式产品、最终 UI 或 M1-04 选型批准。

## 结论和主工程建议

**建议以 B（官方 Tauri 2 + React/TypeScript 模板）作为后续唯一主工程候选，继续复用 drag-rs 和经过许可审查的 Holdem 原生能力。** 当前不批准最终选型，也不宣称两套方案全部通过。

B 已实测完成真实文件接收和安全复制拖出，代码只保留技术探针，两个独立 WebView 窗口可运行，便于后续添加 SQLite 和独立文件架。A 原生拖放成熟且可复用，但其单架、进程级互斥、内存文件列表和自动过滤失效路径等行为与既定多架及持久引用需求不同，需要较多调整。B 的原生接收与 HTML 排序仍存在实测冲突，必须先验证成熟 pointer 排序组件或复用 A 的原生接收路径；不能把当前 HTML 原型当作正式排序方案。

**A 默认移动来源是可定位、可能用一行修改修复的问题，不是放弃整个成熟项目的充分理由。** 其修复候选是把 `DragMode::CopyOrMove` 改为 `Copy`，再做英文、中文、取消及冲突回归。本轮未给 A 打该补丁或伪称回归通过。推荐 B 的依据还包括多窗口与数据模型改造范围，不能把 B 的 Debug 内存数值当作性能优势。

## 固定来源与变更边界

| 基线 | 源码/版本 | 本轮改动 |
|---|---|---|
| A | [Holdem 固定提交](https://github.com/iamzubin/holdem/tree/35644fe0f1c4eeda4c9bd4deb02bb7b8b4b6b734)，版本 3.1.1 | 原生拖放源码不改；构建时配置覆盖为测试应用标识、关闭 updater endpoint 与更新签名产物；运行使用专用测试配置，关闭分析与自启，TEMP/WebView 数据隔离 |
| B 模板 | [create-tauri-app 4.7.5 固定提交](https://github.com/tauri-apps/create-tauri-app/tree/16a754703baf0ca40fd4462dfc7674bc99bf3ef3) | React+TS 模板改成技术探针；移除 opener；添加合成素材、双窗口、日志、置顶、托盘和测试快捷键；保留模板图标 |
| B 拖出 | [drag-rs](https://github.com/crabnebula-dev/drag-rs)，crate `drag = 2.1.0` | 通过 Cargo 使用成熟 Windows OLE 实现；不重写 COM/OLE；强制 Copy；不复制或修改该库源码 |
| A 拖出补丁来源 | Holdem 内 `app/src-tauri/drag-patch`，2.1.0；上游来源记录 `a567d08a539df85c88f05f8921153d2a78b426a3` | A 自带 CopyOrMove 扩展；本轮未再修改 |

只读取上游仓库，没有向 Holdem、Tauri 或其他人的项目推送、提 Issue 或改设置。直接复用来源的 MIT 全文保存在 `experiments/m1-02/licenses/`；详细义务见第三方清单。

## 环境和可执行文件身份

Windows 11 Home，构建 22631；一块 1920×1080 显示器，125% 缩放。Git 2.55.0、Node 24.18.0 / npm 11.16.0、Rust/Cargo 1.99.1、MSVC Build Tools 2022 17.8.4、Windows SDK 10.0.22621、WebView2 155.0.4283.62。本机现有网络代理仅用于构建子进程，没有修改系统代理或将代理地址写入公开脚本。

| 参与人工验证的程序 | Profile | 大小 bytes | SHA256 |
|---|---|---:|---|
| A Holdem 探针 | Debug / 未优化 | 42937344 | `E9AA38A0F86AC92C389B6F1508CD7525C64EB5C5E4BC751CA345FA9D8444228A` |
| B Tauri 探针 | Debug / 未优化 | 12151296 | `B727A5ADCB70ACB2A76583E1432998657DF529463165EA22EA959F4E89EB0914` |

已在本机保留这两个确切文件供验收。不是签名安装包或公开 Release。后来再次编译的文件只有在哈希相同的情况下，才能直接继承本表的二进制身份；源码与编译通过不能替代重新运行的行为证据。

依赖锁定存在差异：A 使用 Tauri 2.11.5 / wry 0.55.1，B 使用 Tauri 2.12.5 / wry 0.57.0；B Vite 8.3.5，A Vite 8.1.2。本轮先比较各自锁定的基线，不据此把所有差异归因于架构。后续若做严格性能或归因分析，应对齐版本、窗口数量和功能负载。

## 实测结果

“通过”仅指下面写明的步骤和环境。“源码存在”“构建成功”不代表未操作的 GUI 功能通过。

| 项目 | A：Holdem | B：官方模板 + 成熟拖出库 |
|---|---|---|
| Windows 构建及运行 | 通过；前端约 655 KB chunk 提示，原生 Debug 构建成功 | 通过；TypeScript/Vite、Rust 测试、fmt、Clippy `-D warnings` 和原生构建成功 |
| Explorer → 应用真实拖入 | 通过；用户拖入 `probe.txt`，后台原生事件与显示文件数核对 | 通过；用户拖入后记录 `native-drop: probe.txt`，来源和原始合成文件哈希一致 |
| 应用 → Explorer 真实拖出 | 拖出成功，目标哈希正确；**默认安全复制失败**，同盘来源被移动 | 英文及中文空格文件均通过；OLE 返回 Dropped，目标与来源哈希一致且来源保留 |
| 应用间跨窗口 | A/B 与 Explorer 已实测；A→B、B→A、两个应用文件架互拖未验证 | 同左；两个独立 WebView 窗口已同时运行，但不把“能开窗”当作文件互拖通过 |
| 原生接收与 React HTML 排序 | 无同等排序探针；未验证 | 原生接收开启时未完成排序；关闭时相同代码人工拖动成功，见下面对照证据 |
| 置顶 | 专用配置及可见悬浮窗已运行；未单独遍历切换 | UI 操作及后端 `always-on-top` false/true 切换通过 |
| 测试全局快捷键 | F11 日志收到事件、唤出有效；另有重复注册告警 | 注册 Ctrl+Alt+Shift+F12 成功，按键后端 `shortcut-fired` 与前端事件到达 |
| 系统托盘 | 源码有托盘；完整菜单与关闭隐藏未独立验收 | 创建成功且记录 `tray-created`；Show/Quit 菜单和关闭生命周期未完整实测 |
| DPI、多显示器、窗口调整 | 本机单屏 125% 可显示运行；其他未测 | 同环境两窗口可显示运行；配置尺寸不等于所有缩放/显示器场景通过 |
| 启动/空闲资源/拖拽性能 | 仅单次 Debug 内存快照；无等价冷启动/帧时数据 | 记录启动到 ready 约 1.35 秒的单次内部计时；非多轮冷启动，不是 release 性能 |
| 引用持久化、离线保留 | 内存列表、刷新过滤无效引用，不满足已定完整语义 | 未实现；属于 M1-05，不伪称已满足 |

### 安全复制证据与时间顺序

所有测试使用程序自建文本，没有私人素材：

- `probe.txt` SHA256：`5717B9E5F107D48B2B0C55A2FE2637E2C1B21B5987B021F06376DDE28DF10DDF`。
- `中文 空格样本.txt` SHA256：`A8C29353DCBD82407F4C65EA75ECE08DD9E3CC0271FDB8FA38E8417828A4D9B4`。

先测试 B 拖出，16:57 的核对快照显示两文件来源及目标均存在、哈希一致。之后 A 从 B 的目标文件夹引用 `probe.txt`，拖到 A 目标文件夹；17:04 核对发现 A 的直接来源已消失、目标哈希正确，最初合成素材仍在。因此 B 目标文件后来缺少 `probe.txt` 是 A 后续移动造成，不能回填成 B 的历史测试失败。17:05 B 接收 A 目标中的文件，仅收到路径事件；来源仍在且哈希正确。

对应脱敏证据：`m1-02-evidence/b-copy-verification.json`、`a-drag-verification.json` 和 `b-inbound-verification.json`。A 根因见固定版本 [drag_ops.rs](https://github.com/iamzubin/holdem/blob/35644fe0f1c4eeda4c9bd4deb02bb7b8b4b6b734/app/src-tauri/src/commands/drag_ops.rs)：`DragMode::CopyOrMove`，其 Windows patch 同时允许 COPY/MOVE，Explorer 同卷选择 MOVE。未发现私人文件损失，测试仅涉及合成副本。

### HTML 排序对照

两个窗口使用同一份 React 代码，分别设置 `dragDropEnabled: true/false`。自动输入在两窗均出现 `html-drag-start` 但没有 drop，因此不能只据自动输入判断方案故障。用户实际操作后，截图与日志核对：

- 主窗口（原生接收开启）：仍为 Alpha、Beta、Gamma；两次拖动以 `html-drag-end: none` 结束。
- HTML 对照窗口（原生接收关闭）：Beta、Alpha、Gamma；日志 `html-drop-target: Gamma: Alpha`、`html-reorder: Beta → Alpha → Gamma`、`html-drag-end: move`。

用户简短回复“是的”后仍以这两窗具体截图及事件为准，没有把两边都标通过。该结果证明当前组合存在兼容障碍；不证明所有 React 排序、pointer 方案或 Tauri 版本都失败。修复建议：后续优先验证既定候选 dnd-kit 的 pointer 交互与原生文件接收共存，或受控复用 A 的 OLE 接收层；不得为了排序丢失真实文件路径或安全复制能力。本轮不提前引入 M1-03 UI 系统。

### 资源快照及局限

| 单次空闲快照 | 进程数（含 WebView 子进程） | Working set MiB | Private memory MiB |
|---|---:|---:|---:|
| A | 8 | 274.5 | 194.8 |
| B | 9 | 491.3 | 208.1 |

B 预创建两个 WebView，A 窗口、功能、采样时机和 Tauri/wry 版本不同；不能直接据表判定谁更快或更省内存。首次原生编译在本机 A 约 4 分 30 秒、B 约 2 分 08 秒，缓存、下载和依赖不同，不构成运行性能结论。未采集拖拽期间帧时、CPU 曲线、大文件或长时间资源增长；真实拖拽成功不等于性能门槛通过。

## 源码、兼容性与维护成本

A 已提供 Windows COM/OLE `IDropTarget` 接收、真实拖出、托盘、全局键及显示逻辑，可参考并按 MIT 复用。原生接收关闭 WebView 默认 DnD 并接入自己的 drop target；和 B 的两种窗口配置不同。需要处理的产品差异包括进程级 `Global\\HoldemAppMutex`、主窗口和 popup 的单架假设、内存文件列表、失效路径过滤，以及面向目录/多架/SQLite 的边界。快捷键路径先 register 再 on_shortcut，实测出现 already registered 警告，但统一 handler 仍收到 F11，不能将告警等同于功能完全不可用。

A 含自动更新、自启和分析依赖。测试关闭 updater endpoint、自启及分析，使用专用应用标识和 TEMP/WebView 目录。源码对旧 `holdem_drops` 日期目录有清理逻辑，测试 TEMP 已隔离。若采用其代码，须重新核对授权目录、清理语义和默认配置；本轮未把这些行为带入 B。

B 通过成熟库调用 Windows OLE，未自行造原生拖出轮子。只允许已知两个合成素材索引，不暴露任意路径 IPC；生成素材使用 create_new，已有内容不符则拒绝覆盖。测试检查重复准备保留字节、篡改后拒绝覆盖并保留原内容。B 没有数据库、目录扫描、删除、冲突重命名或崩溃恢复逻辑，不把探针当作完整文件安全实现。

直接来源许可为 MIT 或 MIT/Apache-2.0 可选许可，选择 MIT 路径保留原文，与主项目 Apache-2.0 的组合有可行路径。B 的 Windows 目标 Cargo 元数据中 262 个传递包已生成 SPDX 清单，初筛未发现缺失许可或 GPL/AGPL 字段；**这只是元数据筛查，不是全部二进制分发合规审核**。Node 依赖、平台条件、NOTICE、实际许可文本和安全漏洞仍须在正式分发前逐项完成。没有凭空声称法律审计或完整安全审计通过。

## 可复现方法

1. 在 Windows 安装 Git、PowerShell 7、Node.js 24、Rust 1.99.1、MSVC Build Tools、Windows SDK、WebView2。工具链仅用于开发，不要求改变系统安全设置。
2. 从本仓库根目录运行 `pwsh -NoProfile -File scripts/m1-02/build-baselines.ps1 -Baseline Both`。A 获取固定 SHA 到忽略的 `.m1-02-work/holdem`，不重置已有改动；B 读取提交的 npm/Cargo lockfiles。脚本不修改上游远程、不包含本机代理或凭据。
3. A 仅使用专用合成文件，运行前设置专用 TEMP/TMP；原版有移动来源行为。B 测试过程见 `experiments/m1-02/tauri-baseline/README.md`。先退出当前探针再重新编译，Windows 会锁定运行中的 exe；本轮该情况曾使重建失败，保留准确候选后退出进程并重试，不把失败当成功。A 的 Tauri CLI 会重写 Cargo.toml 换行，第一次构建后 `git status` 会出现只有换行造成的改动提示；脚本已改用 Git 规范化内容比较，允许原样复建，同时拒绝真实源码改动和额外未跟踪文件，不使用强制重置。
4. B 自动检查：TypeScript/Vite、cargo fmt、cargo test --locked --lib、cargo clippy --locked --all-targets -- -D warnings、Tauri Debug no-bundle 构建。素材单测先验证已存在内容绝不被覆盖。
5. 人工拖拽由用户鼠标执行；本轮 Windows 自动输入工具禁止跨窗口拖动，未绕过工具限制。事件、来源存在性和 SHA256 交叉核对；不上传含本地路径的原始日志和 Explorer 截图。
6. CI 的 `Windows baseline A/B` 只编译和运行自动检查，不运行桌面 GUI、不代替以上手工步骤。最终 check-run 链接回写 Issue #3/PR；失败原因如实记录。

## 外部调查线索与核验层级

先查本仓冻结需求与本机工具链；按用户偏好从近期社交反馈、社区、GitHub 原始记录到正式文档逐级调查。社交查询未取得可用于本工程结论的近期具体复现；社区讨论只用于寻找原生拖出与冻结问题线索，没有作为当前功能结论。

- [Holdem Issue #45](https://github.com/iamzubin/holdem/issues/45)：早期冻结反馈，2026-04 提出、2026-08 已关闭；不能将旧反馈当作当前版本必现。当前版本实际拖拽已另行验证。
- [Holdem Issue #10](https://github.com/iamzubin/holdem/issues/10)：移动相关需求线索；最终以固定版本 CopyOrMove 源码和本轮来源消失实测核验。
- [Tauri 原生拖出议题 #2593](https://github.com/tauri-apps/tauri/issues/2593)：区分内建接收和向系统拖出；本轮实际使用 drag-rs，不把议题讨论视为已实现。
- [Tauri #11274](https://github.com/tauri-apps/tauri/issues/11274) 与 [wry #1638](https://github.com/tauri-apps/wry/issues/1638)：特定输入/窗口兼容线索；未在本机复现，不记为当前缺陷。
- [Tauri Windows 前置条件](https://v2.tauri.app/start/prerequisites/)及 [rustup 官方安装说明](https://rust-lang.github.io/rustup/installation/other.html)：补充工具链与安装来源；本机能否构建以实测为准。

## 未验证项与下一关卡

Win10、100%/150% DPI、多显示器插拔、窗口缩放全过程、完整托盘生命周期、两个应用架互拖、Release 性能、批量/大文件/目录/取消与冲突全部未通过验收；原因分别为缺少对应物理环境、技术探针范围或尚未执行，不能合并描述为“支持 Windows 10/11 全场景”。

M1-03 可以在用户验收本轮结果后按既定两套 UI 候选继续，但应优先把排序兼容问题纳入同功能验证。A Copy 修复回归和跨窗口/DPI 补测属于继续选型前必须补齐的证据。M1-04 由用户批准唯一主工程；本轮停在研究 PR，不自动进入 M1-03 或正式文件闭环。
