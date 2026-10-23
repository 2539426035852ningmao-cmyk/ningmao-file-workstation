# 功能补充 · 手动重新定位失效引用

日期：2026-10-24（Asia/Hong_Kong）。Issue #12，承接用户继续具体功能开发授权；对应冻结决策第 17 项的手动修复部分。基于 Draft PR #11 单独开发，不代表 M1-05 / M1-06 原生验收通过。

## 用户行为

临时收集架或本次中转架中的引用失效/不可读时，打开详情，选择“重新定位文件”或“重新定位文件夹”。复用系统选择器选择新位置后，再用原生确认框核对完整旧/新路径。

确认后只更新软件记录的路径与名称，记录 ID、所属架、标签与手动顺序保留。不会复制、移动或删除文件；选择文件夹不会自动绑定或枚举其中素材。取消不会替换引用，不扫描原路径的父目录或磁盘搜索。

绑定目录记录不提供这一操作；恢复绑定目录后刷新。当前不实现自动监控、批量搜索修复或绑定根路径迁移，这些决定继续保留。

## 实现和复用

- 使用已有 tauri-plugin-dialog **2.8.3** 的 blocking_pick_file / blocking_pick_folder、OkCancelCustom 和 blocking_show；执行于 spawn_blocking，文件/确认对话框关联调用窗口，等待期间不持有 Store 锁。IPC 只接收已登记 ID 与文件/文件夹选择，不接收前端自由指定的新路径。
- 上游 [plugins/dialog/src/lib.rs](https://github.com/tauri-apps/plugins-workspace/blob/44293a5722efcaf27060504e63b17aeba721b40f/plugins/dialog/src/lib.rs)，Cargo VCS 与 tag dialog-v2.8.3 均对应 44293a5722efcaf27060504e63b17aeba721b40f；上游/本机源码 blob 均为 7cfad33b1a2301c801d48ed251a1b069d9497d74。未复制或修改库源码，无新依赖；MIT 原文与许可归集沿用现有记录。
- 复用 rusqlite，一条原子 UPDATE 仅改 path/name，SQLite UNIQUE 拒绝同架重复引用，失败不合并或覆盖分类。schema 仍为 1，不迁移数据库。
- 选择器打开前与确认写入前都检查 ID/架类型/当前路径；原路径恢复或确认期间记录已变化则拒绝写入。保留最新分类，不用旧快照覆盖标签。
- 复用现有 shadcn Button / Sheet、Lucide 与 FileThumb。错误显示于当前详情；成功写入但刷新失败时明确写“引用已更新”，不误报“原引用未更改”。缩略图缓存键加入路径，防止相同 ID/时间/大小继续显示旧图。

## 已运行的后台检查

Windows 11 家庭中文版 10.0.22631；Node 24.18.0、Rust 1.99.1、Playwright 1.64.1。Rust/SQLite 和合成文件仅在临时目录，本机必要编译为 BelowNormal / CARGO_BUILD_JOBS=1；浏览器为 headless，不操作用户窗口。

- 3 项新增 Rust 回归：文件移动改名后修复、ID/标签/顺序/所属架重启恢复；重复/无效/相对/陈旧目标与已恢复引用拒绝；文件夹/仅本次架语义及绑定目录拒绝。与底座合计 **15 项**通过，Clippy -D warnings 通过。
- headless 浏览器由 3 项增为 **5 项**：覆盖取消、失败原路径保留、错误可见、成功与重载、同时间大小的 PNG 换路径刷新、已提交但刷新失败的正确提示、文件夹入口、正常/绑定记录没有修复入口；既有拖拽/选择/复制契约继续通过。
- 先观察到缺少方法/入口的失败，再实现；缩略图旧缓存也由实际浏览器失败定位后修复。没有把模拟系统选择器或确认框当作原生通过。
- TypeScript/Vite 构建通过，界面机械检查无报告。暗色桌面与窄窗错误态检查使用 SYNTHETIC 合成内容，两个有界检查轮次后停止视觉打磨。

[脱敏验证记录](../research/reference-relocation-evidence/verification.json)；[桌面详情](../research/reference-relocation-evidence/desktop-dark.png)；[窄窗失败提示](../research/reference-relocation-evidence/narrow-error.png)。云端最终源码、CI、下载产物及 hash 完成后回写 Issue #12 / 对应 PR；不将旧预览包当成包含本功能的新包。

## 复现与边界

仓库根执行 scripts/build-desktop.ps1 -Native / -Browser、scripts/build-preview-package.ps1。已有包用 verify-preview-package.ps1 只读核对，不能运行 EXE/MSI 替代后台检查。桌面 CI 现在也覆盖堆叠 PR，避免功能分支缺少浏览器检查。

真实系统选择器、原生确认、取消、焦点/置顶、多屏/DPI、最终精确候选原生拖入拖出和正常退出重启仍待用户明确方便后集中验证；本轮没有调用这些窗口。安装升级卸载、磁盘实际耗尽、完整许可审核和签名仍保留。

PR 为独立增量草稿，依赖 #11。回滚只 revert 对应功能提交；没有 schema 升级，不删除原文件或用户数据库，不强推或自动合并。
