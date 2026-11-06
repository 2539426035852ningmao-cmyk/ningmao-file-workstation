# MORPH-02：同一宿主原生形变最小结论（2026-11-06）

状态 **PARTIAL**：A 方案的单 main、固定全尺寸、自由位置验证通过，允许继续小范围产品化；不放行替换多文件架 Dock，也不阻塞网络/AI 主线。关联 [#64](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/64)、[#65](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/65)、[Draft #66](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/66)。

## 精确版本

- 基线 #62：`ffb8bc8ea8568544e28ec5e0103c6f064b15a4e9`；独立分支 `feat/morph-02-native-probe-20261106`。
- 本轮可运行探针源码：`7ed665a90913512a57175d17d533ecb450ba72c2`。
- Windows x64 debug EXE SHA256：`88cba9a01df190cd8dd3cebb97a6c5150ef6092a91cc10bfb88c65e5a7b5d919`；仅本地工程样机，无签名、安装或公开发行。
- r7 源码/EXE/ZIP保持原样，#62 没有合入本探针。退出样机后直接使用原 r7 独立目录回滚，不复制探针数据库覆盖旧数据。

## 实际实现

`MorphProbe` 包装现有 App，收起时保持文件视口挂载且 inert，文件快捷键和双眼计时器暂停；既有文件后端、Store、Copy、任务、会话与权限不重写。`MorphController` 一个调度器、至多一个进行中的尺寸 IPC；从已确认帧反向，settle 后停止 RAF。原生接口限定 debug + `morph-probe` feature、main、独立数据目录，复用原生拖放空闲检查及三物理像素轮廓保护。

默认构建不选择此组件。专用构建同时使用 `VITE_MORPH_PROBE=1` 与 Cargo `--features morph-probe`；只设前端开关不能通过原生权限门槛。没有给 desktop-entry 增加文件权限。

此版仅验证 48×48 Orb、288×72 Capsule 和初始 Full 的尺寸/上下文。胶囊暂为工程入口，非 D05 完整快捷工作层；全尺寸窗口禁止手工缩放。旧 QuickPeek/Dock 与管理中心没有删除或替换。

## 验证矩阵

| 项目 | 结果 | 真实边界 |
|---|---|---|
| 同一 Windows HWND 20 次 Orb→Capsule→Full | PASS | Win11 10.0.22631；scale_factor=1.25；主窗口 527606；终态420×520 |
| 原生搜索保留 | PASS | 输入 MORPH02→收起胶囊→点击展开；搜索仍为 MORPH02，HWND未变 |
| 原生正常退出、空DB完整性 | PASS | 菜单完整退出，测试进程结束；integrity_check=ok，0素材/0任务 |
| 搜索、选择、隐藏快捷键、滚动保留 | PASS | 浏览器真实App组件，合成后端；80项滚动600px往返保持，不冒称原生选择/滚动 |
| 反向、拖入冻结、20循环、reduced-motion | PASS | 浏览器控制器/事件回归；不是Explorer OLE证据 |
| RAF时钟回退回归 | PASS | 模拟时钟先失败（宽650.208超过420），修复后通过 |
| 全浏览器回归 | PASS | 初版实现130项；随后最终改动专项7项（4形变+3窗口）通过 |
| Rust与质量检查 | PASS | 改动前后103项/6ignored；圆角修正后针对性1项再通过；严格Clippy通过于前一原生实现 |
| 普通前端构建 | PASS | 未设探针变量；产物JS无工程探针按钮文本 |
| 新SHA CI | PENDING | 7ed665a：Desktop 42211897042、Preview 42211897063；以GitHub最终状态为准 |
| Explorer OLE、多架/拆合/托盘唤醒组合 | NOT_TESTED | 原有路径未变，但不能继承为新宿主通过 |
| Win10/150%/多屏/贴边/逐帧闪烁与焦点 | NOT_TESTED | 125%单机采样不能外推 |
| 最终视觉 | NOT_TESTED | 未做连续录屏与用户视觉验收；角落及过渡截图不得作为无闪烁证明 |

原生 `morph-probe.json` 记录881次已执行尺寸提交、scale1.25与初始HWND。orb/capsule/full_visits是**命中端点的帧数**（34/31/37），包含下一段初始帧，不是循环数；20次结论来自真实控制器依次等待60段完成且界面显示20/20。

## 失败与最小修复

1. 第一次原生探针在第一轮停止；界面最初用通用中断覆盖原始错误。补保留错误原因后确认尺寸入口拒绝。另补时钟实验复现 RAF 时间先于异步返回时刻产生负进度，限定进度0..1，未放宽宽高上限。
2. 第二次仍遇到圆角/尺寸拒绝；尺寸已在部分展开位置。采用 CSS 一致的圆角归一化（输入圆角0..36，回传圆角不超过实际物理尺寸的一半），避免把分开解码/取整的圆角与高度要求为精确比例。第三次原生20循环及手动收起展开通过。首两次未记录每帧原始浮点值，不声称精确定位到某一ULP。
3. 前两份失败样机在无素材/无任务的隔离数据下停止其自有进程后保留，没有操作其他程序。第三份经菜单正常退出。
4. 只读DB核对首次误用历史表名copy_jobs报错；检查实际schema后改读jobs，未修改数据库。

## 复跑与退出条件

现有 Node/Rust 工具链，先 `npm run build:test`，再 `npx playwright test morph-probe.spec.ts window-chrome.spec.ts`；Rust用 `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib morph_probe`。

专用原生：前端设置 `VITE_MORPH_PROBE=1` 后 `npm run build`；从仓库根执行 `cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --features morph-probe`；复制EXE至新的测试目录，启动时设置独立 `NINGMAO_DATA_DIR` 和 `WEBVIEW2_USER_DATA_FOLDER`。不得将该目录指向日常数据。按钮执行20次；Alt+左/右只用于中断/反向探针。

本轮结束扩大动画探针。**下一次 UI 切片只迁移 D05 高频胶囊操作及单架上下文；在多架所有权、OLE命中区、紧凑状态退出/重启和边缘几何通过前，保持默认关闭，不替换r7。** 若这些验证要求扩大文件权限或破坏Dock，转B受控交接，不继续堆叠A补丁。三主题、管理中心三栏和旧QuickPeek迁移保留在产品路线，非本次已完成项。

按[#67](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/67)继续主线：优先浏览器分享组件许可/相对路径/固定哈希与同候选闭环，再已有CI和薄Provider适配。无新依赖、模型调用、外网部署、费用或自动合并。
