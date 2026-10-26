# 项目状态与技术图解 · 唯一总览入口

> **快照：2026-10-26 17:33 (Asia/Singapore) 前后的 GitHub 核查**；PR 状态可能继续变化。启动开发或执行合并时必须重新读取远端 HEAD、PR 和 CI；本页**不是自动更新的实时仪表盘**。
>
> 严格区分五种状态：`PLAN` 仅规划；`CODE` 功能候选代码；`CI_PASS` 自动验证通过；`NATIVE_PARTIAL` 有限 Windows 实机验证；`RELEASED` 正式发布。任何一个状态不自动代表下一个状态。

## 1. 当前究竟处于什么阶段

**P2 r21 收束 / 原生部分验收 / 功能尚未合并进 `main`。P3/P4 还没有正式产品能力交付。**

- [主分支](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/tree/main)：治理、M1-02/03 可复现研究、设计、文档、P3/P4 规划；没有已合并的完整桌面产品主工程。2026-10-26 审核时 `main` 为 `b57fdc3c2abb3e07b0133d2eb657e899d790fa7a`。
- [PR #30](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/30)：P0/P1 候选，已修复与 main 的文档冲突，仍开放未合并。
- [PR #32](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/32)：P2 多架/管理中心候选，Draft。
- [PR #35](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/35)：D-ORB 双眼球与 Dock 候选，Draft。
- [PR #36](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/36)：UI-B01–B07 / r19，局部 Windows 用户实测已通过，Draft。
- [PR #40](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/40)：r21 最新综合候选（在 r20 管理流程基础上增加全局唤出和离屏找回），Draft，Windows 综合验收 `PARTIAL`。
- [PR #38/#39/#41](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/41)：只合并了 P3/P4 研究、产品和执行合同，不代表网络或 AI 代码已实现。
- [Releases](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/releases)：核查时**无正式 Release**。

### 堆叠 PR 真实依赖关系

```mermaid
flowchart TD
  M["main · 已合并的治理 / 文档 / 研究"]
  P30["#30 · P0/P1 基础应用"]
  P32["#32 · P2 多文件架 / 管理中心"]
  P35["#35 · D-ORB 双眼球 / Dock"]
  P36["#36 · UI-B01–B07 / r19"]
  P40["#40 · r21 管理中心 / 全局唤出 / 离屏找回"]
  M --> P30 --> P32 --> P35 --> P36 --> P40
  classDef base fill:#e5eefc,stroke:#6593c5,color:#183f63;
  classDef candidate fill:#f6f0df,stroke:#d6ad56,color:#5e470f;
  class M base;
  class P30,P32,P35,P36,P40 candidate;
```

**合并原则：** 不能把末端 #40 当作不依赖前置的普通改动直接合入 main。先逐层查看 diff/冲突/审批/原生矩阵；main 集成包必须有独立验证。请勿因 `mergeable=true` 就自动宣布 R3 获批。

## 2. 功能实现矩阵

| 能力 | 开发实现证据 | 当前产品交付状态 / 边界 |
|---|---|---|
| 临时文件架引用、真实绑定架安全 Copy、同名自动编号、SQLite | #30 与历史原生 r10 实测 | **CODE + 部分原生实测**；未主线集成 |
| Ctrl/Shift/框选多选、拖出、Space 预览、双击默认程序、排序/筛选 | #30 和 r10 真实 Windows 抽样 | **CODE + 部分实测**；需在 r21 上完整回归 |
| 多架、Dock、悬浮/贴边入口、管理中心 | #32/#35 | **CODE + 部分实测**；跨屏布局完整验收未闭环 |
| 双眼球/胶囊/轻预览、拖动与圆角 | #36 r19 | **特定 r19 包用户专项 PASS**；不能继承给其他二进制 |
| UI-B01–B07、软回收/系统回收/整架恢复 | #36 后端与候选实现 | **CODE/CI**；最新 r21 UI 恢复/回收专项待测 |
| 组合搜索/跨窗 Copy 进度/取消反馈 | #40 r20/r21 | **CI_PASS**；最新候选真实跨窗任务待验 |
| Ctrl+Alt+Space 全局唤出、暂停、恢复 | #40 r21 | **NATIVE_PARTIAL**；基础唤出三项 PASS，冲突、重启、释放等待测 |
| 唤出纠偏/手动找回离屏窗 | #40 r21 | **CODE/几何测试**；完整多屏拔插未证明 |
| 局域网安全传输 | Issue #37 与研究文件 | **PLAN**；无正式 Windows 双机互传 |
| AI 相似图/语义搜索/模型下载 | P4 决策与研究 | **PLAN**；默认不联网、不下载 |
| 安全插件生命周期/跨插件工作流 | P4 第29–44项 | **PLAN**；未宣称已能安装第三方插件 |

## 3. 最新 r21 精确验证信息

- 当前 PR #40 HEAD：`f717b1a2ea58de8d16a259dcc6c67dc8dd2f5ad3`，其后端/前端程序源码与精确构建基线区分记录。
- r21 精确构建源码：`76210933f97d9a00b5ed8a3f4f8cd3ee24d73748`。
- r21 EXE SHA256：`c119311a50ff03cefe686a370602d994ba7a080c7de4ecdbb6b52f432178f76a`。
- r21 本地 99 浏览器 + 69 Rust 测试通过；另外两个历史受控入口维持 ignored，并有明确的 fixture 运行记录。
- r21 当前 HEAD 的 [Desktop CI](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/40295641668) 和 [Preview CI](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/40295641558) 均 SUCCESS；CI 不含完整人工 Windows DPI/多屏验收。
- Windows11 Home 中文版 10.0.22631：**原生 PASS** 仅包括管理中心打开、默认快捷键隐藏后唤出、暂停不唤出、恢复后再唤出。自动捕获 Space 预览时观察工具定位/最小化异常，**尚不能判断产品 Bug**。
- 真实磁盘 Copy/回收 UI、快捷键占用冲突、改键持久化、窗口遮挡/置顶、Win10/125%/150%/多屏均仍要在此精确候选版本验收。
- 合成数据安全记录 `schema 2`、`3 架 / 6 引用 / 0 任务 / 0 回收日志`、`integrity=ok`、保护文件未变；尚未完成所有异常场景。

权威详细证据：[r21 原生矩阵](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/feat/p2-management-flow/docs/research/P2-closeout-evidence/native-matrix.json) · [r21 native session](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/feat/p2-management-flow/docs/research/P2-closeout-evidence/r21-native-session.json) · [阶段收束](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/feat/p2-management-flow/docs/stages/P2-closeout-20261026.md)。

## 4. 产品架构：现有与未来分清楚

```mermaid
flowchart TB
  subgraph UI["前台 UI（P2 候选已实现部分）"]
    A["L0 双眼球/胶囊/贴边 Dock"]
    B["L1 小文件架"]
    C["L2 按需管理中心"]
  end
  subgraph CORE["受控核心"]
    D["Rust 文件身份/安全 Copy/系统回收"]
    E["SQLite + WAL · 引用/标签/回收"]
    J["既有任务与事件反馈"]
  end
  subgraph FUTURE["后续可选能力（未正式实现）"]
    F["P3 LAN TransferProvider"]
    G["P4 SearchIndex / AiProvider"]
    H["P4 Plugins / Workflow"]
  end
  A --> B
  B <--> C
  B <--> D
  C <--> D
  D <--> E
  D <--> J
  F -.-> D
  G -.-> E
  H -.-> J
  classDef future fill:#f1f1f1,stroke:#999,stroke-dasharray: 4 4,color:#555;
  class F,G,H future;
```

箭头是目标边界**概念关系**，不表明每个同名 SDK 或模块当前都真实存在；Codex 应首先复用仓库已有的 Rust Store/任务和前端组件，不应照图重新建全套。

## 5. 后续顺序与阶段 Gate

| Gate | 可交付结果 | 必须仍然成立的保护 |
|---|---|---|
| **P2 收束** | 精确 r21 或后续最小修复版，Windows 原生安全/窗口/管理任务验收，分层 PR 正确合入 main | 原文件不动、schema2/WAL、同名副本、回收多引用、精确回滚 |
| **P3 隔离研究** | LocalSend 候选锁版本/许可；合成双进程本机安全试验 | 不默认开放 LAN 端口、不改主 Cargo.lock、不得冒充双机 |
| **P3 LAN 真机** | 官方 LocalSend ↔ 柠猫及柠猫 ↔ 柠猫双端受保护互传 | 首次监听/配对与权限需审批；身份、SHA256、非覆盖/断线安全 |
| **P4-A 本地搜索** | Ctrl+K 跨架中英文与标签/状态，索引可重建 | 只索引授权范围、不扫全盘、不损 schema2 |
| **P4-B AI** | 相似图片、可选本地模型、候选标签 | 下载/资源/许可需确认；默认不用云端或收费 API |
| **P4-C/D** | 官方安全示范插件与受控工作流、任务恢复 | 插件不继承权限、不自动修改或上传真实文件 |

整个项目目前没有正式 Release。每个交付候选应有 `source SHA`、`build SHA`、`EXE/MSI hash`、`CI 结果`、`NATIVE PASS/PARTIAL/FAIL/NOT_TESTED`、`风险`、`回滚` 七类证据。

## 6. 已确认与待确认

- **已确认、不再重问：** 43 项 V0.1 冻结决策、P4 独立 44 项、P3 免费/轻量界面职责、P2 已通过的视觉专项。见 [P4 44 项](product/P4-confirmed-decisions-01-44-2026-10-26.md)。
- **待原生证据决定，不用重新问产品：** r21 多屏/DPI、跨窗任务、回收及快捷键冲突；应先测试得出事实。
- **待技术探针，不用产品投票：** LocalSend Core 是否可直接复用、FTS5 中文短词效果、本地模型容量与插件沙箱可行性。
- **确实需要用户选择或风险授权：** 发布前兼容矩阵与签名成本策略、P3 首次真实 LAN 开端口/配对、P4 具体模型下载/云端出站/真实文件修改；见 [待决策清单](open-decisions.md)。

## 7. 图像证据使用规则

- [双眼入口样机概览 PNG](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/97f779ee900ed10231a2ab18a562812afffcbd87/docs/research/dual-eye-orb-evidence/overview.png) 出自候选分支历史提交，**属于原型/浏览器证据，不是 r21 原生桌面截图**。
- 设计 SVG/布局示意也应标明是设计探索，不能在 README 中标注为“正式发布截图”。
- Windows 实际截图要保留精确包 SHA、系统版本、DPI、捕获方式和隐私脱敏说明；不要混用候选二进制的视觉验证。
