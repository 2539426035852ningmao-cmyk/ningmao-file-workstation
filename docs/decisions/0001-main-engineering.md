# ADR 0001 · 唯一主工程与设计系统

状态：用户批准。日期：2026-10-23。跟踪 Issue #7。

用户在 M1-03 交付后回复：“可以，我这边通过了。然后按照你的方法，你自行继续推进”。此前给出的明确建议是独立 Tauri 2 主工程、shadcn/ui 主设计系统、按需复用 SpaceUI 文件专用组件。本记录落实该批准，不修改 43 项产品需求。

## 决定与依据

- 唯一长期工程位于 apps/desktop，Tauri 2 + Rust + React + TypeScript；SQLite 由 Rust 的 rusqlite 管理，前端不直接取得任意 SQL/文件写权限。
- 主设计系统采用 M1-03 已验证版本的 shadcn/ui / Radix，使用 Lucide。SpaceUI 仅选择性复用 FileThumb，不加载第二套主题和通用控件。
- 原生接收使用 Tauri；拖出复用 drag-rs 2.1.0 并强制 Copy。内部排序使用 M1-03 已通过原生实测的 dnd-kit pointer 方案；虚拟化使用 TanStack Virtual。
- 不将 Holdem 全应用作为主工程。其默认 CopyOrMove 已实测可移动来源，且带有不符合产品语义的单架、清理和分析逻辑。未采用代码不以修复其所有问题作为本工程前置条件，历史失败仍保留。
- 使用 tempfile 的 persist_noclobber 发布复制结果，避免自行编写平台重命名/覆盖逻辑。复制使用标准文件句柄分块读写，Windows 复制期间拒绝来源写入和删除；取消只清理本次创建的暂存文件。

## 安全和残余风险

M1-02 的独立模板 Copy 英文/中文来源保留已实测；M1-03 的开启原生接收后 pointer 排序已实测。研究中使用了不同二进制，这些历史证据不能代替 M1-05 新候选的跨应用验证。

新闭环必须覆盖引用恢复、取消清理、同名并发发布、失效保留、数据库一致性和原生启动。未测 Win10、额外 DPI、多屏与目标创作软件继续列入 M1-06，不虚构为通过。当前不实现原文件移动或实体删除。

本阶段只提供本地 Debug 候选，未完成签名安装、Release 性能和完整传递许可/NOTICE 分发审计，不创建公共二进制 Release。实验目录保留为历史证据，不形成第二个长期产品工程。

## 调查与原始资料

先读取冻结需求、本机和既有 GitHub 研究；社区反馈仅作线索。近期 SQLite/WAL 讨论提示不能简单复制活动数据库作为备份，因此本闭环不提供伪备份按钮；以后应使用 SQLite 正式备份 API。

技术依据：[rusqlite 源仓库](https://github.com/rusqlite/rusqlite)、[rusqlite 0.40.2 API](https://docs.rs/rusqlite/0.40.2/rusqlite/)、[tempfile 不覆盖发布 API](https://docs.rs/tempfile/3.27.0/tempfile/struct.NamedTempFile.html#method.persist_noclobber)、[Tauri 官方对话框插件](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/dialog)、[image 有限解码](https://docs.rs/image/0.25.10/image/struct.ImageReader.html#method.limits)。具体包以提交的锁文件为准。
