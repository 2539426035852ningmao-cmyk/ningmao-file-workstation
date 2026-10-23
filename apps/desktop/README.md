# 柠猫文件工作站 · 主工程

M1-04 已经用户批准。主工程使用 Tauri 2 / Rust / React / TypeScript / SQLite 与 shadcn/ui，按需复用 SpaceUI FileThumb。历史对比样机位于 experiments/，不作为第二套产品长期开发。

## 本机构建

需要 Windows、PowerShell 7、Node.js 24、Rust 1.99.1、MSVC、Windows SDK 和 WebView2。从仓库根目录执行：

~~~powershell
pwsh -NoProfile -File scripts/build-desktop.ps1 -Native
pwsh -NoProfile -File scripts/build-desktop.ps1 -Browser
~~~

本轮提供 Debug no-bundle 候选，不是签名安装版。前端资源内嵌，不依赖 Vite 开发服务。npm ci 使用锁文件并禁用依赖安装脚本。

## 运行和数据

默认数据存放在 Tauri app_data_dir/app.ningmao.fileworkstation 对应目录；不扫描用户磁盘。开发验收可通过进程环境 NINGMAO_DATA_DIR 指定独立数据目录，WEBVIEW2_USER_DATA_FOLDER 隔离 WebView；这些变量不上传私人路径。

首次建立“灵感收集”和“本次中转”两个架。文件拖入临时架仅保存引用，拖入绑定目录复制并保留来源；按住“拖出复制”拖向资源管理器空白位置。六点手柄只调整内部顺序。Delete 只在临时架移除引用，不删除实体。

标题栏关闭隐藏到托盘；“完整退出”退出程序，只清空本次架引用。复制未结束时退出被阻止，先等待或取消。异常退出后保留引用、任务和可能残留的临时文件，不自动清理。

图片按需预览 PNG/JPEG/WebP，单文件限 24 MiB、8192×8192、64 MiB 解码内存；不支持类型/超限保留图标。目录仅浅层浏览，文件夹不递归复制。绑定失效保留记录，点击刷新重查状态。

## 测试与安全

生产 dist 不包含 tests/harness.html 的模拟后端。浏览器回归使用单独 dist-test，明确标注合成数据；原生复制与数据库由 Rust tests/file_safety.rs 测试。

复制暂存文件由 tempfile 创建，persist_noclobber 发布，同名自动加序号；不静默覆盖。取消不会撤回已完成的文件。SQLite WAL 不能通过单独复制数据库主文件备份；本阶段不提供数据库备份/迁移 UI。较新 schema 拒绝写入。

未提供实体删除、移动来源、自动目录清理、更新和自启。数据安全回归不等于所有异常或恶意目录并发替换防护均已证明。未测平台和正式分发审计见 docs/research/M1-05-verification.md。

许可和复制来源见 source-provenance.json、仓库 licenses/ 和 docs/third-party.md。模板图标仅用于候选，未作为最终品牌设计。
