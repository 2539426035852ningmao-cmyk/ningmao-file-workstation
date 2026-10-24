# 项目交接记忆

更新：2026-10-24。本文件是继续工作的索引，以精确源码、CI、产物与真实操作为准。

## 当前唯一入口

先读AGENTS.md、docs/product-decisions.md（全部43项）、docs/execution/v0.1-p0-p4-2026-10-24.md、design.md、apps/desktop/DESIGN.md、docs/codex-start-here.md、docs/roadmap.md与当前Issues/PR。唯一主工程apps/desktop：Tauri2/Rust/React/TypeScript/SQLite，shadcn/ui主、SpaceUI仅FileThumb。

正式稳定发行版尚无。main规范基线8ca3064f2fec063bbacc0fd7df8dfb541138163f，已接纳M1-01/02/03及设计/AI协议。功能集成入口integration/v0.1-p0-p1 / PR #30 / Issue #29，不能直接推main或自动合并文件安全/最终视觉/权限/重大架构。

## 已收束的历史

#9→#11→#13→#21→#22→#24→#26→#28是完整祖先链，#28底座6b66c52543857a12a1d8402da518e6383e664aab包含全部已有功能。#9 dirty实际为4份文档冲突，无Rust/SQLite冲突；07ca273已受控合入main规范。旧9个Draft现关闭未合并，由#30接替；所有分支、报告和r1–r9保留，可重新打开，不机械重复合并。

#19唯一公开诊断文档按原blob f8825c47b8fd23a2c565a9b19a89cd399106be02保留在docs/reviews，未删除旧脚本/环境。Gemini #17仍未恢复，0模型请求，登录/Pro/Overages关闭UNKNOWN，不读取凭据、不绕过策略、不新增费用，不阻断产品正常开发。

## 当前可核查候选r10

源码8ad5760279e43ba3ab306f49fa8cdbc6f0b87ade；构建779c36c11e6bd80b6bef608adb9a68ff977ef77c，完整tree同为d88aa1e0df182a22d68d122ebac4f0b3e864ba36。44浏览器/18Rust、fmt/Clippy、Windows编译、Windows/Ubuntu仓库检查与MSI全通过。本机包白名单/8哈希/PE/MSI检查通过，268许可原文缺失0、既有映射警告1；r10核心原生复测已通过，未安装MSI，产品验收与合并批准仍待完成。

r10 EXE SHA256 a96c2f9bf2178e90a7378a1c6807de0eabdb1c3fedeb049cf589004006ebffea；MSI 025911c6fd108b308addd4294ac10c062f9c56eb345a6a1f70dfb51a8dfb29f6。包与来源证据见docs/research/P0-P1-multiselection-evidence，完整历史/回滚见docs/stages/P0-P1-integration.md。

临时引用/绑定安全Copy、冲突编号、SQLite、缩略图、系统默认打开/Space、排序/筛选/视图记忆和失效引用修复保留。正式/preview共享420×520/最小340×320，官方window-state2.5.0只记忆尺寸，不恢复位置/隐藏/置顶；完整退出保存，异常退出可丢最后尺寸，无DB迁移。

## 真实验收与本轮修复

r9在用户明确方便后真实启动：4项原生拖入并SQLite核对、PNG缩略图、英文/中文/PNG直接卡片Copy到Explorer，源/目标哈希一致且5个受保护对象不变；手柄排序用户确认且数据库核对，完整退出与尺寸文件保存。见docs/research/P0-P1-stage-evidence/r9-native-acceptance.json。

用户指出缺少Ctrl点选、Shift连选、空白框选，r9整体验收不通过。r10已补齐这些选择、Ctrl+A、框选实时反馈/边缘滚动/取消、多选汇总和整组原生Copy请求；筛选隐藏项/输入焦点受保护，Delete仅文件区移除引用不删来源；超64项明确拒绝、不截断，异常引用整组拒绝。旧右键/预览/引用修复回归保持。r9结论不得继承给r10。

r10的Ctrl/Shift/框选和整组Copy、绑定目录3文件复制/重名保护、一次完整退出/重启与尺寸恢复，以及用户手柄排序/Space预览/默认打开均已真实通过；源/目标哈希与SQLite快照已核对。见docs/research/P0-P1-multiselection-evidence/r10-native-acceptance.json。下一步后台推进P2，产品验收/合并仍需批准；原生取消/Shift拖动等剩余清单保留。Win10/DPI/多屏/各创作软件、实际安装升级卸载等继续标未验证。目录可引用/原生拖出，向绑定目录递归复制文件夹当前不支持，不夸称完成。

## P2当前实施

PR #32 / Issue #31，r11功能源码2175ef19c2fd3f8e8215544ca80321161295b084；CI构建e4b54d5a649d9617499576d195275be4779a9da8，两者完整tree一致。48浏览器/22Rust、fmt/Clippy、Windows原生构建、双平台仓库检查与MSI均通过；精确记录docs/research/P2-first-loop-evidence/r11-verification.json。r11本机已下载并通过9文件白名单/8哈希/PE/MSI核验，未启动、未安装，原生验收全部待做。EXE SHA256 2a44b34a386230657ea851666236d95098713aa96c832779bbfcd59cb7e1b6eb，MSI 10d527260115af5a3ed6dc0567c256358cd3f2a76e3f51e506c8b0f77231b74b；本机交付名M1-06-preview-package-r11。新的文档证据提交不改变该候选应用源码，PR仍Draft，不自动合并。

feat/p2-desktop-loop从76658ecc（PR #30文档证据头）独立推进，不改r10包。原生desktop-entry与main共用Runtime/Store；命名持久/中转架、跨架引用事务、收起/点击展开、基础Dock每页5架、入口拖动/位置记录及工作区纠偏已写入源码。native Enter仅唤出、Drop消耗一次冻结ID目标并复用原Import/Copy；JS文件操作限制main，入口仅桌面命令。入口悬停仅SQL目录，不探测绑定磁盘；X仍隐藏到托盘。云端检查已通过，新二进制原生体验尚待验证，不能继承r10结论。未实现智能贴边/自动隐藏、每架独立展开窗口、独立管理中心。见docs/stages/P2-development-entry.md及P2-windows-acceptance.md。

## 完整制作线路

P0可靠文件流转＋P1紧凑文件架集中交付 → P2真实悬浮球/贴边/Dock/多架及按需管理中心 → P3先LAN双设备确认/受保护字节传输/哈希一致，再远程/同步 → P4先授权范围内本地跨架元数据检索，再可选AI建议与经过确认的可恢复修改。P2入口Issue #31，第一份桌面闭环正在开发，完整阶段尚未完成；不能用假动画/假AI/接口冒充真实闭环。全部43项保留。

## 持续边界

默认后台/无头/云端，不弹窗、不装软件、不操作用户鼠标键盘；重任务优先云端。仅用户明确方便时集中原生验收，r10末尾因物理Esc停止电脑控制，未继续关闭测试窗。后续“继续项目”只按后台推进，不重新操作窗口。普通可逆开发持续自主推进，不因原生待验停止所有独立工作，不宣称已经安排后台自动继续。

不扫描私人目录、不上传私人素材/数据库/凭据/私人路径/原始账号日志。临时架仅引用，绑定目录默认Copy/冲突保留，移除引用不删实体；回滚使用旧候选或revert，保留数据库、来源与旧环境，不强推、不清理用户数据。正式发行、网络外部暴露、费用/隐私AI与高风险合并各自保留人工门槛。
