# 网页互传 × Windows 工作站 × main 集成导航（2026-11-09）

> 本文件是 **main 可合并的纯治理导航**，不代表应用已合并、发布或完成 Windows 双设备实测。编写时 main 为 `fc8903dc3a34a17707db3a9cbd12f631baaef71b`，完整 `apps/desktop` / `apps/web` 尚在开放候选 PR 内。开工需再次刷新 GitHub PR、分支 HEAD 和 CI，禁止依赖本文快照自动执行合并。

## 目前可复用的实现（候选，不是 Release）

- **原 Windows 文件工作站**：本地受控 Store / SQLite、安全复制、引用、局域网 TLS 互传在 P2/P3 叠放的候选分支；主入口涉及 #30 → #32 → #35 → #36 → #40，后续综合开发如 #77。必须保留最新已核验的功能与用户文件安全规则，不能用旧 #40 原样覆盖更新候选。
- **Web W0 三套统一主题**：#79 独立界面；#81 已把 W0 外观与 W1/W2 传输控制器整合，不能分别覆盖同一 `apps/web` 目录。现有公开 GitHub Pages 链接是 W0 静态预览，不能据此称跨设备已上线。
- **网页身份/传输/落盘**：#82 安全原生接收与 Source Bridge；#83 Windows 一次性授权与撤销；#84 Rust 原生 WSS；#85 Browser → Windows 的 WebRTC 接收与 Store 保存候选；#87 网页取消/重试；#88 WS 心跳检测和设备离线行为；#89 Windows → Browser 的原生安全源 / WebRTC 反向发送。
- **并行分支注意**：#86 基于 #84 开发部分相同的信令桥，**不是 #85 的直接祖先**。在最终合并上游时检查 #85 与 #86 的相同 Rust WSS/TS 信令功能，避免重复引入两个通道、两个状态源或错乱的锁顺序。
- **W4 暂未授权**：Cloudflare Access 完整配置、实际受保护域名、用户账号验证、TURN、公众部署和费用仍是独立 Gate。未经明确批准不得部署、更改 DNS、向公网暴露本机端口或引入云端保存。

## 可操作的集成路线（不自动执行 merge）

1. **冻结真实基线**：核对 main、#77（现有桌面综合候选）、#81–#89 各自最新 SHA / CI，备份测试数据目录并保持原 Windows 稳定包可回退。先确认原有用户文件与 SQLite 是否仍是 schema2，且无未经授权的数据迁移。
2. **建独立集成分支**：从目标最新桌面候选开始，而不是把 #89 直接覆盖 main。先完整比较 `apps/desktop/src/components/TransferPanel.tsx`、`transferBackend.ts`、`src-tauri/src/web_device.rs`、`web_transfer_*.rs`、`Cargo.lock`、`tests/harness.tsx`；再逐层吸收 UI 与 WSS/WebRTC/Store 功能。冲突需要按语义重整，不得选择 `ours/theirs` 整目录替换。
3. **统一一份共享协议**：只保留一个 `apps/web/src/peer.ts` + `guards.ts` 和一个原生 WSS 设备会话/授权入口；`invite` / `decision` / RTC 描述/候选 / `receipt` / `cancel` 同时按任务 UUID 与源设备绑定，严格校验 64 MiB / 64 KiB / 安全文件名。
4. **验证 Windows ↔ Web 两个方向**：Browser → Windows 必须取得用户明确同意、经 Rust Store/jobs 真正保存才回 `persisted=true`；Windows → Browser 先读取已选 Store 引用、用户允许之后发送，浏览器 SHA 校验不自动标记保存。取消、断线、撤销、源改变、超时、重复同名都不得静默覆盖或冒充成功。
5. **全量自动回归**：分别跑 `apps/web` 的 Vitest/TypeScript/Vite/Worker dry-run/Playwright；`apps/desktop` 的 TypeScript/Vite/Playwright、Windows Rust fmt/clippy/tests/编译、MSI 只读检查；补交叉端双 Chromium synthetic DataChannel。只以集成分支的 **最新 HEAD** 结果为准，不能继承 #88/#89 的旧 CI。
6. **Windows 原生手工验收**：至少同一账号的两端独立真实浏览器/Windows，双向合成 TXT、PNG，与 SHA256 验证相同；逐项确认拒绝、取消、授权撤销、断连/重连、超时、中文文件名与冲突重命名、Windows 原文件哈希、SQLite 完整性、退出后资源/端口残留、三套主题和窄悬浮窗。跨 NAT/手机/W4 仍另行验收。
7. **提合并候选 PR**：保留 `main` 的冻结决策与最新文档；严格 review、许可证审计、可回滚包与用户确认后，再根据仓库分支保护机制顺序合并。**不要在 W4 或真实文件门槛未通过前将网络实验视为正式主线发行**。

## 当前 Gate

| Gate | 状态 | 含义 |
|---|---|---|
| WEB UI/W2/W3 候选源码 | CODE | 已有页面、Worker、RTC、原生适配；各 PR 自己的 CI 与证据需随 HEAD 核查 |
| main 含完整桌面/网页应用 | NOT_DONE | main 仍是治理基线，本文件及文档 PR 不能替代应用合并 |
| Windows ↔ Browser 真实双设备收发 | NOT_TESTED | #85/#89 的本地合成 E2E 不能冒称云端或 Windows 实机 |
| 手机与跨 NAT 公网 | NOT_TESTED | TURN/防火墙、运营商和网络拓扑独立实测 |
| W4 Access / 公网 / 费用审批 | NOT_APPROVED | 维持关闭，不自动部署 |
| 用户文件/数据库破坏性迁移 | NOT_APPROVED | 不触碰生产目录，不静默迁移 |

## 快速入口

- [桌面主应用综合候选 #77](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/77)
- [Web W0 UI 合并候选 #81](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/81)
- [Windows 受控文件保存 #82](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/82)
- [Browser → Windows #85](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/85)
- [Web 可靠性修复 #88](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/88)
- [Windows → Browser #89](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/89)

本文件不存储 Access 凭据、设备 token、用户真实路径或私人素材。若近期 HEAD 改变，以真实 GitHub 历史和精确测试为准。
