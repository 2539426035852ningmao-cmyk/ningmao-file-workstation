# 当前交付状态

- 阶段：M2/P3 互传与 P4 智能能力集成。用户反馈上一轮候选验收通过，具体版本及各项原生操作范围尚未逐项核对，不代替已有测试记录。
- 集成分支：`feat/first-delivery-integration`，基线 P2 `4034d785cfc15f3885427f57a90cf63c07467cb9`；当前提交以 `git rev-parse HEAD` 为准。
- P3：`feat/p3-task-integration` `0199c7a360ce67682d188895e830a05d1513de6b`，仅本机回环 Rust 接口；真实 LAN、桌面发送入口未完成。完整回环任务测试一次失败，单独重跑通过，原因未证实。
- P4：`feat/p4-local-search` `1a6244d12d1bacfe16c590f7de8854dba8893a73`，本地规则标签建议已接入；真实模型对话尚未实现。
- 已将 P3 `0199c7a` 和 P4 `1a6244d` 合入集成提交 `5dd7b1b46a0c9995307d108f57fdba8505d8227e`；前端生产构建及 Rust `cargo check --locked --no-default-features` 通过。集成版尚未打包或原生验收，P3 仍无产品发送入口或真实 LAN，P4 规则建议并非模型对话。
- 已有试用候选见 `docs/stages/MVP-first-trial-20261029.md`；其真实文件闭环仍未全验。
- 下一步：测试便携包结构和启动，再完成 M1 原生闭环；继续 P3 桌面入口与 LAN。跨网、手机互传、AI 聊天依次实施。
- 回滚：保留 P2 `4034d785`、P3/P4 独立分支及原有候选和数据；不将试验数据覆盖用户数据库。

## 当前实施切片（2026-10-30）

- 用户已反馈上一轮便携候选验收通过；保留原生记录，不据此补写未执行的双机或模型测试。
- 集成 CI `40935178842` 在 rustfmt 阶段失败，根因为通过路径引用 Store 时两个子模块解析错误；改为源头显式路径，并补齐实验 Windows 开发依赖，传输失败不是此项 CI 的原因。
- AI 界面复用仓库既有 Sheet/Button/Input。已评估 assistant-ui `@assistant-ui/react` 0.15.32（MIT，https://github.com/assistant-ui/assistant-ui），本切片不引入其 core/cloud/store 等运行层；未复制其代码。Markdown 使用 `react-markdown` 10.1.0（MIT，https://github.com/remarkjs/react-markdown），锁文件固定版本与完整性，默认跳过 HTML/图片，代码可复制；依赖许可由现有收集脚本核验。
- 前端按需加载聊天模块，生产构建新增分块约 124KB / gzip 38KB。浏览器3项聊天测试和管理中心15项通过，属于受控 Harness，不代表真实模型或 Windows GUI 通过。
- 下一条：合入已实测的批量发送与聊天 Rust 后端，运行统一回归、打包，并核对 IPC 与界面实际连通。
