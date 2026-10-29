# 当前交付状态

- 阶段：M1 便携候选；M2 回环发送并行准备。
- 集成分支：`feat/first-delivery-integration`，基线 P2 `4034d785cfc15f3885427f57a90cf63c07467cb9`；当前提交以 `git rev-parse HEAD` 为准。
- P3：`feat/p3-task-integration` `0199c7a360ce67682d188895e830a05d1513de6b`，仅本机回环 Rust 接口；真实 LAN、桌面发送入口未完成。完整回环任务测试一次失败，单独重跑通过，原因未证实。
- P4：`feat/p4-local-search` `1a6244d12d1bacfe16c590f7de8854dba8893a73`，本地规则标签建议已接入；真实模型对话尚未实现。
- 本轮新增便携打包脚本，将已核验的预览包与隔离数据启动入口组合；尚未在 CI 或 Windows GUI 验收。
- 已有试用候选见 `docs/stages/MVP-first-trial-20261029.md`；其真实文件闭环仍未全验。
- 下一步：测试便携包结构和启动，再完成 M1 原生闭环；继续 P3 桌面入口与 LAN。跨网、手机互传、AI 聊天依次实施。
- 回滚：保留 P2 `4034d785`、P3/P4 独立分支及原有候选和数据；不将试验数据覆盖用户数据库。
