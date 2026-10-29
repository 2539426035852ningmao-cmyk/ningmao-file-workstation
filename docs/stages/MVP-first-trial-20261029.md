# 柠猫 0.1 Windows 内部候选 · 2026-10-29

双击 Start-Ningmao.cmd 启动，不需要 Rust、Node 或开发命令。请从此入口启动，勿直接运行 package 中的 EXE，以保持独立数据路径。关闭 X 是隐藏到托盘；完整退出在右上更多菜单底部。已启动时先从托盘找回，避免重复启动。

程序和试用数据与旧候选分开：data 保存文件架与设置，webview 保存界面数据；native-test 是本次自动验收数据，日常启动不会使用它。备份时先完整退出，再复制 data 和 webview；不要覆盖旧版数据库。首次先用可丢弃的文件副本试用。

本机已具备 Microsoft WebView2（156.0.4314.50 / 155.0.4283.62），未捆绑运行时。其他机器缺少 WebView2 时不能保证直接运行。包内附测试 MSI，仅供后续审批，不需安装。当前未签名、未正式发布。

## 来源与核验

分支 feat/p2-management-flow，PR #40 HEAD 916e6ca89bfa77521fd51b014c932f581cd2b0e1。
CI 构建源 b5806a505ba1cb27b624061d8ff997a61671e329，为临时合并提交，与上述 HEAD 的 tree 同为 0135f27d56fa2ebd36a0b660835b5acd656c6e8d。
Actions 40717962697，三项 CI 成功。原始9文件包完整保留，许可证272记录、1项既有警示，见 package/license-manifest.json；未宣称发行许可清关。

EXE SHA256: 4e9c1544bd7a16a5b1831c9e71148e4e7ab116443f06f1266e19bd8fdc402416
MSI SHA256: 3e3c2ef5f61a62b1b6364a160accfaada056d4224fa17f6b584ab2d86581c3c0

## 本次精确程序的 Windows 验收

| 操作 | 结果 | 备注 |
|---|---|---|
| 软件启动 | PASS | 新隔离目录启动，现有 WebView2 |
| 文件拖入 | NOT_TESTED | 原生选择器已打开，工具焦点不一致，取消选择 |
| 文件预览 | NOT_TESTED | 不沿用旧 r21 或 r25 结果 |
| 文件拖出 | NOT_TESTED | 不用 CI 替代跨窗口拖放 |
| 安全复制 | NOT_TESTED | 本包 GUI 尚未执行；对应 CI 已通过 |
| 多选排序 | NOT_TESTED | 本包未验 |
| 悬浮球与 Dock | NOT_TESTED | 本包未验 |
| 托盘与窗口恢复 | NOT_TESTED | 本包未验 |
| 退出与重启恢复 | NOT_TESTED | 菜单完整退出 PASS；重启恢复未验 |
| 文件和数据安全 | PASS | 仅限本轮：无文件操作、隔离 DB integrity=ok / schema2 |

当前可以打开并进行受控试用，但尚未达到用户要求的日常 MVP 完整验收门槛。优先补齐导入→预览→多选导出→复制→重启闭环；P3/P4、高级动画和广泛兼容矩阵不阻挡本轮，也不继续扩展。