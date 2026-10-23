# 第三方代码与工具记录

核验日期：2026-10-23。主项目 Apache-2.0 不替代第三方各自许可证。

| 项目 | 用途 / 状态 | 固定版本 | 原始许可与义务 | 修改与风险 |
|---|---|---|---|---|
| [actions/checkout](https://github.com/actions/checkout) | CI 获取代码，已使用 | v7.0.1 / `3d3c42e5aac5ba805825da76410c181273ba90b1` | [MIT](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/LICENSE)；仅引用 Action，未复制源码，原许可由上游保留 | 未修改；Node 24，使用 GitHub 托管 Windows/Ubuntu runner；固定 SHA、只读权限、禁持久凭据；Dependabot 每周检查 |
| [GitHub CLI](https://github.com/cli/cli) | 本地初始化工具，不随应用发布 | v2.103.0 / windows_amd64.zip | [MIT](https://github.com/cli/cli/blob/v2.103.0/LICENSE)；工具未提交本仓库 | 官方发布便携包，SHA256 `80c846a5b8432672ca6373b34ce9de998c9686aaa1885c845f2e1ee81f713726` 与 release digest 一致；不复制凭据 |
| [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) | 主仓库 LICENSE | SPDX Apache-2.0 | 从 [GitHub 许可证 API](https://api.github.com/licenses/apache-2.0)获取标准全文 | 未修改许可条款；目前没有需要继承的第三方 NOTICE 内容 |

## 尚未集成的候选

以下 UI 候选保留研究入口，未集成、未批准最终采用。M1-02 已实际验证的技术来源单独列在后文。

| 候选 | 后续任务 | 后续必须核查 |
|---|---|---|
| [spacedriveapp/spaceui](https://github.com/spacedriveapp/spaceui) | M1-03 UI 候选 A | 实际许可、组件可分离性、依赖、性能与长期维护 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | M1-03 UI 候选 B | 固定版本、源码许可和署名、与拖拽/虚拟列表组合的兼容性 |

## M1-02 实际来源及使用范围

| 来源 | 固定版本与路径 | 许可和署名 | 修改、兼容性与维护成本 |
|---|---|---|---|
| [Holdem](https://github.com/iamzubin/holdem/tree/35644fe0f1c4eeda4c9bd4deb02bb7b8b4b6b734) | `35644fe0f1c4eeda4c9bd4deb02bb7b8b4b6b734`，3.1.1；源码只取到本地忽略目录，不复制完整源码进主仓 | MIT，Copyright 2024 Zubin Choudhary；原文留在 [holdem-MIT.txt](../experiments/m1-02/licenses/holdem-MIT.txt) | 原生源码不改；仅构建配置覆盖和隔离运行；含自带 drag-patch、更新、自启和分析依赖；默认拖出可移动来源，主工程不能原样直接采用。尚未完成全部传递依赖分发审计 |
| [create-tauri-app](https://github.com/tauri-apps/create-tauri-app/tree/16a754703baf0ca40fd4462dfc7674bc99bf3ef3) | npm 4.7.5 / commit `16a754703baf0ca40fd4462dfc7674bc99bf3ef3`；模板生成于 `experiments/m1-02/tauri-baseline` | MIT OR Apache-2.0，选择 MIT；[原始许可](../experiments/m1-02/licenses/create-tauri-app-MIT.txt)保留 Tauri Programme 版权 | 改为技术探针、双窗口、合成素材、原生拖出、日志；移除 opener；模板图标仅用于探针，不是产品品牌；源码及 npm/Cargo lockfile 保留。原生接收与 HTML 排序存在实测冲突 |
| [drag-rs](https://github.com/crabnebula-dev/drag-rs) | Cargo crate `drag = 2.1.0`（精确锁定）；当前上游 v2 分支研究快照 `585b2fcba3dc80908e59a3620af4fe9090491a00`，不把分支最新 SHA 冒充 crate 发布 SHA | MIT OR Apache-2.0，选择 MIT；[原始许可](../experiments/m1-02/licenses/drag-rs-MIT.txt)保留 CrabNebula 版权 | B 直接作为依赖、不改库源码；Windows OLE 强制 Copy 已实测。A 自带 patch 的 `.cargo_vcs_info` 上游来源为 `a567d08a539df85c88f05f8921153d2a78b426a3`，有 CopyOrMove 扩展，不能与未修改 crate 混淆 |
| Tauri / Rust 及前端传递依赖 | 以提交的 Cargo.lock / package-lock.json 为准 | [B Windows Cargo SPDX 元数据清单](research/m1-02-dependency-licenses.json)记录 262 个包的名称、版本、license、repository | 元数据初筛没有 GPL/AGPL 或缺失许可字段，不等于完成全部法律/漏洞审查。正式二进制发布前仍须收齐实际许可文本、NOTICE，审核 npm 依赖和可选平台组件 |
| Rust 工具链 | 本机 1.99.1；官方 rustup-init SHA256 `00f139da614dced87d3c3d4121c43eebdac3c1bf8a5ee86b9d80dfd71c8d70fd` | 官方开发工具，不打包进产品 | 安装在本地工作目录，未改全局 PATH；rustc/cargo/std 校验官方 manifest SHA256；不上传工具链和代理配置 |

保留直接来源 MIT 全文后，不新增没有实际来源要求的虚假 NOTICE。传递包中的 NOTICE 和其他义务仍需在正式发布前核对；当前不发布公共二进制 Release。完整试验范围见 [比较报告](research/M1-02-comparison.md)。
