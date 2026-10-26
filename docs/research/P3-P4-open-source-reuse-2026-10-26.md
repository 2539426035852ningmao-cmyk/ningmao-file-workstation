# P3–P4 开源项目复用与风险研究（2026-10-26）

> 状态：**研究完成 / 候选待验证（非技术选型最终批准、非功能交付）**。
> 本文先于 P3/P4 实现存档，供 Codex 开发直接引用；不修改现有程序、不开放端口、不安装模型。
> 现有基线：P0/P1 PR #30 → P2 PR #32 → D-ORB PR #35 → UI-B01–B07 PR #36，均未作为正式稳定版发布；以实施时实时 GitHub 状态为准。

## 0. 结论

- **P3 LAN 首选验证 LocalSend Protocol v2.2 + LocalSend Rust 核心**；只借鉴或复用经过锁定提交、许可证和 Windows 实测核准的最小模块，**不整体移植 Flutter UI**。先实现两台 Windows 的用户确认发送，**临时传输不等于持续同步**。
- **P3 异地传输第二候选 iroh / sendme**：局域网链路真实通过后，隔离验证身份、NAT、可选中继、费用和离线恢复；不提前对公网开放。
- **P4 第一优先级继续使用现有 SQLite，测试 FTS5**：先搜索文件名/标签/类型/来源和已授权数据；不预先新增一套搜索服务器。
- **P4 AI 可选 FastEmbed-rs / Ollama**：最小可替换 provider，用户显式开启；模型下载、内存、磁盘空间、模型权重许可证和可能的费用须单独确认；**现有 ChatGPT Plus 或 Google AI Pro 会员不等于免费程序 API**。
- P2/UI-B06–B07 已有内部回收和 **schema 2** 候选；P4 索引升级不能覆盖其 WAL 一致性备份、未来 schema 拒绝写入和回滚边界。

## 1. 调研顺序与证据强度

| 顺序 | 观察 / 线索 | 含义与证据等级 |
| --- | --- | --- |
| 1 社交媒体 | [r/foss 对 LocalSend 稳定性、文件夹递归与平台差异的使用反馈](https://www.reddit.com/r/foss/comments/1rbl8al/localsend_is_a_great_or_awesome_foss_utility_but/)；[r/selfhosted 关于临时发送与持续同步的讨论](https://www.reddit.com/r/selfhosted/comments/1qcerh5/removed/) | 说明需要双端真机、目录及失败用例；社区个人经验不等于全部环境结论 |
| 1 社交媒体 | [r/LocalLLaMA 混合本地索引与模型选择讨论](https://www.reddit.com/r/LocalLLaMA/comments/1wzn14o/local_rag_for_a_personal_second_brain_embedder/) | 优先根据真实中文文件语料评测；不以模型排行榜替代质量测试 |
| 2 技术社区 | [LocalSend Issues](https://github.com/localsend/localsend/issues)、[Tauri Discussions](https://github.com/tauri-apps/tauri/discussions) | 执行前检索当前 Windows 设备发现、Tauri IPC/窗口权限和近期回归；问题需按版本、日期、环境复核 |
| 3 GitHub 工程 | LocalSend、PairDrop、Syncthing、iroh/sendme、FastEmbed-rs、Tantivy、Ollama、Paperless-ngx | 核对源码布局、可复用边界、license、活跃状态和真实维护代价，不直接照搬 UI/服务 |
| 4 官方规范 | LocalSend 协议、Tauri capabilities、SQLite FTS5、Ollama embeddings、Rust crate 文档 | 对 API/协议/权限的工程结论以官方原文与锁定源码为准 |

注：社交/社区反馈用于**决定测试范围**，不是某个项目“安全可靠”的证明。本轮未编译第三方代码、未进行第三方与柠猫互通测试，也没有安装新依赖。

## 2. P3 候选对比

| 候选 | 用途 | 适配结论 | 许可证注意事项 |
| --- | --- | --- | --- |
| [LocalSend](https://github.com/localsend/localsend) / [Rust core](https://github.com/localsend/localsend/tree/main/packages/core) / [CLI](https://github.com/localsend/localsend/tree/main/cli) | 首版 LAN 发现、文件收发和协议互通对照 | **第一候选，先隔离 PoC**。Rust core 有独立模块且 crate 默认 features 为空，实际必须选明确需要的特性；与现有 Tauri 命令/任务边界做适配 | 仓库顶层为 Apache-2.0；各 crate、依赖、NOTICE、传输协议使用条款需锁 SHA 再独立审查 |
| [LocalSend Protocol v2.2](https://github.com/localsend/protocol/blob/main/README.md) | LAN 互通基准 | 独立规范：多播/HTTP 发现、准备、发送、取消；规范仅需一方开服务器，默认端口可配置，不是不可改动的固定值 | 协议描述不等于代码许可，也不等于默认已有强身份认证 |
| [PairDrop](https://github.com/schlagmichdoch/PairDrop) | 浏览器接收、配对与无安装交互参考 | **体验参考，不纳入第一版后端**；WebRTC/信令路径增加额外复杂度 | GPL-3.0 约束须专题核查，不得直接复制 UI/JS 代码 |
| [Syncthing](https://github.com/syncthing/syncthing) | 长期同步、冲突与离线状态参考 | **仅为后续同步参考**，不把同步服务嵌入第一版临时发送 | MPL-2.0 文件级义务与分发边界需核查 |
| [iroh](https://github.com/n0-computer/iroh) / [sendme](https://github.com/n0-computer/sendme) | P3 第二阶段异地传输、恢复、连接与中继 | **隔离候选，暂不确定选型**；评估 Windows API、实际中继行为、身份和成本 | sendme 为 MIT/Apache-2.0 双许可；还需核对具体 iroh 版本及依赖 |
| [Chorrent](https://github.com/search?q=Chorrent+Rust&type=repositories) | 新项目/社区线索 | 当前不列正式候选，需核实正式仓库和维护程度 | 未核实，不作为依赖 |

### P3 最小闭环与验收

1. **先只在隔离环境**验证 Rust core 最小特性、Windows 可编译性和 LocalSend 官方客户端的协议兼容。固定源码 SHA、Cargo.lock、许可清单和构建证据。通过前不把它加到正式主应用。
2. 经用户**单独批准**，开启 LAN 接收/发现及必要的防火墙访问；默认关闭后台监听，不自动公开目录。
3. Windows A 选文件 → 发现/手动输入 B → 明确核对设备身份并请求配对 → B 明确接受 → 限定目录的加密收发 → 流式校验 SHA256 → 不覆盖的原子落盘 → 可加入柠猫文件架。
4. 设备发现不代表认证；LocalSend 协议允许 HTTP/HTTPS 形态，**柠猫产品策略必须选择受保护连接，明确证书/指纹的信任验证**，不可静默退回未认证明文传输。参考客户端的默认行为不自动满足本产品安全要求。
5. 必测：防火墙阻挡、VPN/网卡/AP 隔离、无多播时手动地址、错误设备、恶意文件名与路径穿越、拒收、取消、断线、重名、长路径、大文件、磁盘满、重启后未知任务、临时文件清理和保护文件哈希。
6. 先真实官方 LocalSend ↔ 柠猫互通，再验证柠猫 ↔ 柠猫；交付两端**真实文件字节**与源/目标 SHA256，模拟对话不能算完成。
7. 暂不启用公网/中继、自动同步、默认接收、远程目录读写；单独建立权限和费用 Gate。

## 3. P4 候选对比

| 候选 | 目标 | 适配结论 / 许可证 |
| --- | --- | --- |
| [SQLite FTS5](https://www.sqlite.org/fts5.html) | 文件名、标签、来源和已授权内容的轻量全文/子串搜索 | **第一候选，沿用 SQLite**。先验证当前 SQLite 构建是否带 FTS5；`unicode61` 不等于自然语言中文分词，`trigram` 少于 3 字符不能直接指望命中，短查询需要另外处理。|
| [FastEmbed-rs](https://github.com/Anush008/fastembed-rs) | 本地文本/图像 embedding 与可选重排 | **可选 PoC**。Rust + ONNX；按中文/多语言样本选模型，不用默认英文模型作为中文能力证明；库 Apache-2.0 不代表模型权重一律同许可 |
| [Ollama embeddings](https://docs.ollama.com/capabilities/embeddings) | 可选本机模型 API | **可选服务端适配器**，不强制用户安装或自动下载；必须检测服务是否可用，默认不自动回退到云端 |
| [Tantivy](https://github.com/quickwit-oss/tantivy) | 大量文件/高级全文索引 | **延后**，只有 FTS5 实测容量/延迟不足才引入，避免重复索引系统 |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | 文档导入/OCR/分类体验 | **学习流程，不整套嵌入服务**；各级许可证按实际复用对象审查 |

### P4 最小闭环与验收

1. 先不接 AI：以当前已登记的文件架、引用 ID 和授权范围为索引源，完成 **Ctrl+K 跨架搜索**：中英文名称、已有标签、类型、日期、来源、失效引用，以及可点回原架。
2. 只做**可重建的派生索引**，索引存储与业务记录边界清楚；不默认扫描全部磁盘，不对失效引用自动删除原记录。
3. UI-B06/B07 正推进 schema2 软回收；先检查合并后真实 schema 和 WAL 状态。增量索引不得破坏回收状态、软删遮蔽、未来版本只读保护及包含 WAL 的一致性备份，迁移后必须可验证回滚计划；**普通 git revert 不会将 DB 降级**。
4. 中文测试必须覆盖 1–2 字名、混合中英文、表情/Unicode、路径变更、离线/失效、标签更新、跨架同一实体多引用和回收条目过滤。记录索引大小、启动耗时、搜索延迟和一致性恢复。
5. 只有基础搜索达标后，开放可选 **AiProvider**：模型文件大小、下载来源、权重许可证、内存/磁盘、算力需求和是否传出文件必须明确。首次启用/下载、云端调用与费用需要单独同意。
6. AI 建议仅生成建议：分类、标签、命名建议及差异预览；**真实移动、改名、覆盖、删除、上传前逐项或经明确范围批准**。有审计、失败恢复、撤销边界；不能用演示文本冒充真模型结果。
7. 优先评测真实中文素材：关键词精确性、查全率、误命中率、索引延迟、弱机 CPU/RAM 与缓存占用。并不承诺本地模型“零成本”：会有资源成本，云端 API 另计。

## 4. 与现有工作站的集成约束

- 复用 Tauri 2 / Rust / React / TypeScript / SQLite 主工程和已存在 Store、安全 Copy、引用身份、受限文件窗口权限；**禁止创建第二套文件身份或绕过 existing Copy 校验**。
- 独立 TransferProvider / SearchIndex / AiProvider 是**推荐接口边界**，并非目前已实现 SDK。只有完成端到端试验后才固定类型名、版本和目录结构。
- 文件入口、独立架、manager 只开放完成自身任务所需的最小命令；网络接收、监听、AI 文件上传不可借原生窗口权限直接调用任意路径。
- P2/UI-B01–B07（PR #30/#32/#35/#36）安全与回收 Gate 优先；P3/P4 研究与无权限离线 PoC 可并行，涉及用户 LAN、隐私素材或模型付费前必须停在审批 Gate。
- 不更改 43 项冻结需求、现有设计风格、软件默认小窗；网络和 AI 入口按需放在管理中心。
- 选择第三方依赖前补齐：上游**精确 tag/SHA**、维护与 CVE 检查、LICENSE/NOTICE/传递依赖、制品体积/性能对比、与当前 Rust/Cargo.lock 的相容性。
- **本次仅存档研究，不代表用户已批准任何协议、服务、联网权限或模型费用。**

## 5. 未决技术决策（实施前最小 ADR）

| 决策 | 推荐默认 / 验证方式 | 当前状态 |
| --- | --- | --- |
| LocalSend Rust core 可否原生复用？ | 固定 SHA 运行 cargo build/test；最小 features + Windows 安全编译、官方对照客户端互通，必要时自行实现严格限定的协议适配器 | 待试验 |
| 设备身份与加密 | HTTPS、独立可信配对及证书指纹确认；验证换机/证书轮换/冒名处理 | 待威胁建模 |
| LAN 监听与防火墙权限 | 默认关闭，显式启用、可撤销；手动地址兜底 | 待用户授权 |
| 目的目录和冲突 | 用户授权的目录；temp + hash + 原子发布；默认编号保留双方 | 待双机试验 |
| FTS5 中文搜索策略 | unicode61/trigram/短查询 fallback 实测比较，不能直接断言最佳方案 | 待样本评估 |
| SQLite schema2 协调 | 待 P2 schema 2 代码整合后，以同一备份策略和合成数据验证升级、损坏恢复与旧版拒写 | 待集成 |
| 本地 embedding | 先比较 FastEmbed 与可选 Ollama，评测模型大小/中文质量/CPU/RAM 与许可 | 待试验 |
| 云 AI / 远程文件 | 用户明确同意上传范围、提供器、费用与权限后才启用 | 未授权 |

## 6. 原始资料（按优先级）

**社交反馈**：[LocalSend 用户体验](https://www.reddit.com/r/foss/comments/1rbl8al/localsend_is_a_great_or_awesome_foss_utility_but/)、[LocalSend vs Syncthing 讨论](https://www.reddit.com/r/selfhosted/comments/1qcerh5/removed/)、[本地混合检索讨论](https://www.reddit.com/r/LocalLLaMA/comments/1wzn14o/local_rag_for_a_personal_second_brain_embedder/)。

**技术社区**：[LocalSend issues](https://github.com/localsend/localsend/issues)、[Tauri discussions](https://github.com/tauri-apps/tauri/discussions)、[FastEmbed issues](https://github.com/Anush008/fastembed-rs/issues)。

**GitHub 上游**：[LocalSend monorepo](https://github.com/localsend/localsend)、[LocalSend Rust crate](https://github.com/localsend/localsend/blob/main/packages/core/Cargo.toml)、[LocalSend protocol](https://github.com/localsend/protocol)、[PairDrop](https://github.com/schlagmichdoch/PairDrop)、[Syncthing](https://github.com/syncthing/syncthing)、[iroh](https://github.com/n0-computer/iroh)、[sendme](https://github.com/n0-computer/sendme)、[FastEmbed-rs](https://github.com/Anush008/fastembed-rs)、[Tantivy](https://github.com/quickwit-oss/tantivy)、[Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx)、[Ollama](https://github.com/ollama/ollama)。

**官方文档**：[LocalSend Protocol v2.2](https://github.com/localsend/protocol/blob/main/README.md)、[LocalSend Rust crate 文档](https://docs.rs/localsend/latest/localsend/)、[Tauri capabilities](https://v2.tauri.app/security/capabilities/)、[SQLite FTS5](https://www.sqlite.org/fts5.html)、[Ollama embeddings](https://docs.ollama.com/capabilities/embeddings)。

所有上游链接是 2026-10-26 的调研入口；**落地时必须重新锁定提交和审查真实源码，不依赖动态 main 永远不变**。
