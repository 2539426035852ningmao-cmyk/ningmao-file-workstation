# 第三方代码与工具记录

核验日期：2026-10-23。主项目 Apache-2.0 不替代第三方各自许可证。

| 项目 | 用途 / 状态 | 固定版本 | 原始许可与义务 | 修改与风险 |
|---|---|---|---|---|
| [actions/checkout](https://github.com/actions/checkout) | CI 获取代码，已使用 | v7.0.1 / `3d3c42e5aac5ba805825da76410c181273ba90b1` | [MIT](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/LICENSE)；仅引用 Action，未复制源码，原许可由上游保留 | 未修改；Node 24，使用 GitHub 托管 Windows/Ubuntu runner；固定 SHA、只读权限、禁持久凭据；Dependabot 每周检查 |
| [GitHub CLI](https://github.com/cli/cli) | 本地初始化工具，不随应用发布 | v2.103.0 / windows_amd64.zip | [MIT](https://github.com/cli/cli/blob/v2.103.0/LICENSE)；工具未提交本仓库 | 官方发布便携包，SHA256 `80c846a5b8432672ca6373b34ce9de998c9686aaa1885c845f2e1ee81f713726` 与 release digest 一致；不复制凭据 |
| [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) | 主仓库 LICENSE | SPDX Apache-2.0 | 从 [GitHub 许可证 API](https://api.github.com/licenses/apache-2.0)获取标准全文 | 未修改许可条款；目前没有需要继承的第三方 NOTICE 内容 |

## 尚未集成的候选

以下来自已确认的 M1 基线，仅保留研究入口。M1-01 不拉取或集成应用源码，也不据此认定许可兼容、功能通过或最终采用。

| 候选 | 后续任务 | 后续必须核查 |
|---|---|---|
| [iamzubin/holdem](https://github.com/iamzubin/holdem) | M1-02 技术基线 A | 固定 Commit、实际许可/版权、Windows 拖出实现、安全、构建与维护成本 |
| [tauri-apps/create-tauri-app](https://github.com/tauri-apps/create-tauri-app) | M1-02 技术基线 B 的官方模板入口 | 固定 Release、模板实际依赖与许可、Tauri 2 兼容性、原生拖出验证 |
| [spacedriveapp/spaceui](https://github.com/spacedriveapp/spaceui) | M1-03 UI 候选 A | 实际许可、组件可分离性、依赖、性能与长期维护 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | M1-03 UI 候选 B | 固定版本、源码许可和署名、与拖拽/虚拟列表组合的兼容性 |

未来复制任何第三方源码时，逐项增加所用路径、Commit/Release、许可证、是否修改、必要的版权/NOTICE/源代码义务和安全维护记录。当前没有导入需要单独 NOTICE 的第三方应用源码，故不创建虚假 NOTICE 归属声明。
