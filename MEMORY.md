# 项目交接记忆

更新：2026-10-25。本文件是继续工作的索引，以精确源码、CI、产物与真实操作为准。

## 最新授权与当前验收

用户2026-10-25正式发布docs/execution/v0.1-p2-acceptance-autonomy-2026-10-25.md，全文已原样归档，优先于旧验收/合并措辞。R0/R1及完全局部R2可按检查和GitHub保护规则自主审查验收/普通合并；窗口生命周期、拖放、归属、任务取消、DB状态和用户素材自动R3，#30/#32阶段安全合并/正式发布、LAN监听/配对、隐私AI/付费仍需专项批准。先完成r13集中原生验收，再快速P2→P3/P4，不另堆零散视觉功能。

本次用户明确批准集中验收，r13现已两次通过原生“完整退出”关闭；默认回到后台，不再弹窗。本次仅合成P2-acceptance-r3，未安装MSI。直接拖入、Ctrl/Shift/框选、两项组Copy哈希、Space/Esc/系统打开、拆合/标签/排序、管理中心及正常重启抽样通过。5个保护文件不变，9条持久/绑定记录、非空标签、排序和任务保留；只清1条会话引用，SQLite integrity_check=ok，重启后原生重新采集v3完全相同，合成v1/v2原件保留（未测原生迁移）。实际绑定批次含目录，partial3/4，不能夸称全部成功。

**r13总体FAIL：Dock投放两次无English (2).txt和新任务（R3），固定显示且自动收起关闭的顶部bound-target对照也失败。** 不再要求用户重复拖旧包。另有重启实际置顶true但菜单未勾选（R2）。完整证据docs/stages/P2-r13-native-results.md及docs/research/P2-detached-shelves-evidence/r13-native-acceptance.json。X/托盘、原生任务取消、Win10/DPI/多屏/安装/性能等仍未测。绑定路径扩展前缀曾使字符串比较误报，os.path.samefile确认正确，不是产品放错目录。

后台最小修复同一PR #32：锁定runtime-wry2.12.3将WindowContent拖放发往WindowEvent，r13监听WebviewEvent，改接已有窗口回调，保留唯一导入与原Copy/冻结目标；无新依赖/权限/网络。主窗与所属独立窗的菜单勾选读取各自布局置顶。新增浏览器置顶检查先实际失败后通过；Rust拖放记账测试提取接缝前编译失败，不能称OS复现。下一候选须精确云端包及重新原生验证，不继承r13结果；不合并R3阶段PR、不正式发布。

**最新r14已后台交付核验、未启动/安装。** 功能源563ca7d8ba293dd7b433749445f6e5522ebd4f41，构建7e6b78028bfa55c051936e656133be327360ce9c，完整tree同为3c3617e44586d45e6f0ffdf50932f17e62f55ca3。云端Desktop40139845977、MSI40139845942、双平台仓库40139867090全SUCCESS；62浏览器/32Rust、fmt/Clippy通过。Artifact12578581369，ZIP6f8711f099896aae26297cdb76195bd61b975d3d5d88df22b40196e8f33679e6；本机另存M1-06-preview-package-r14，9白名单/8哈希/PE/MSI只读核验通过。EXE b29191d1e7f71e95236c715923db84a2d36fb843572ebd09613ad72244c15e27；MSI093a7414e010a959079d3cdc90c5d554b442c472e7ea0d849043e251f8c5a5ce。268许可原文缺0、既有映射警告1；debug未签名，需已有WebView。原生NOT RUN，不能说Dock已修好。r13合成材料5保护对象仍未变，旧候选全保留。证据docs/research/P2-detached-shelves-evidence/r14-verification.json。

初轮Linux61/62，旧自动滚动框选测试在异步60条fixture刷新前开始手势；新增等待新增卡片可见/渲染帧，保留全部断言，未改选择业务/跳过/重试。初轮Desktop40139588484及包40139588491被新提交受控取消，不能写为全绿。后续文档头不改变r14精确包身份；新的前台时段仍需确认方便后集中复测。

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

## P2当前实施（以下候选交付时的历史；最新原生结论以上节为准）

r13精确候选：功能源码3061d2077a59050eaf6bad643dfbc32869d2a930，CI构建f3212e6a1c6f75bff7373a99561f906fc4548027，完整tree同为461fa002250da7566b37edabbae1c84ee86c08db。61浏览器/31Rust、fmt/Clippy、Windows编译/MSI、双平台仓库检查及本机9文件/8哈希/PE/MSI核验通过。交付名M1-06-preview-package-r13；EXE a7137619ced1e893e1e88931616d1a4a704bb64cf8168b796d6d9a32bdbbc867，MSI 407e1a02aa23c68e7486a57c60f4e98870ea9736aadec438d3c21f83dd8a10ed。精确记录docs/research/P2-detached-shelves-evidence/r13-verification.json。268许可原文缺失0、既有映射警告1，debug未签名、需已有WebView；未启动/安装。P2-acceptance-r3仅Prepare/Verify，5保护对象未变；原生操作仍待用户明确方便。后续文档提交不混用重构建包身份。

最新r13在同一PR #32继续独立文件架拆合、固定窗口归属/局部快照、空主窗新建、逐窗位置/尺寸/置顶/显隐恢复与跨窗视图记忆。写独立v3并保留v1/v2，SQLite仍schema1；受限shelf-*命名空间加Rust登记归属校验，无裸*或新依赖。原生拖入/拖出分别记账，拖放中不拆合/切架/X隐藏/退出。本机61浏览器/31Rust及fmt/Clippy/生产构建/仓库检查通过；云端Windows/MSI、双平台仓库检查及本机精确包核验均已通过。见docs/stages/P2-detached-shelves.md。新二进制未启动/安装，不继承r10原生结果；全部43项与P0–P4路线保留。以下r12及r11是历史精确候选。

r12精确交付：源码cab536baac6bbd6048657f6c81d8ccdb3e6f3a8b，CI构建202e650e28dc1bef2c296d4f5b88befba5cc61e6，完整tree同为a62de247e5786b4417fd3a8ee0a3909b2e800897。58浏览器/27Rust、fmt/Clippy、Windows构建/MSI与双平台仓库检查均通过，本机9文件/8哈希/PE/MSI核验通过；本机交付名M1-06-preview-package-r12。EXE b44a680d81c17afce07047f1721884db14c4b96b068ca735da436563982dae8c，MSI 74f9ea29b6004fa88949367f03b776e6f87f59af74104ed3725bd339a6b57203。精确证据docs/research/P2-management-edge-evidence/r12-verification.json。首轮Linux实际57/58通过，贴边初始断言与导航鼠标时序有关；测试改为加载后移出指针并安排收起fixture后完整通过，没有改产品代码或跳过断言。新候选未启动/安装；P2-acceptance-r2合成材料已Prepare/Verify（5保护对象），未Launch。原生清单仍全部待验，不继承r10结论。

最新r12在同一PR #32推进：新增按需manager原生窗口（关闭释放）、SQLite只读元数据总览/跨架名称与标签检索/详情/分页、原子批量标签与复制任务取消、真实桌面设置；左/右贴边18×64细柄、鼠标唤出/离开延迟收起、拖入保护、目标DPI定位、置顶与复制状态点。三窗口命名权限，文件操作仍仅main。专用标签通知避免主架间接扫目录；主题跨窗口同步。v1布局原件保留，只写独立v2，保存失败不报已保存。云端全套与精确包已通过，原生体验未验证。见docs/stages/P2-management-edge.md；尚未实现独立多架拆合、全局快捷键、实时断屏重连等，不称完整P2通过。默认继续后台，不启动新窗；原生验收仍等用户明确方便。

以下为保留的r11历史候选，不能把它的构建身份或原生未测状态混入r12。

PR #32 / Issue #31，r11功能源码2175ef19c2fd3f8e8215544ca80321161295b084；CI构建e4b54d5a649d9617499576d195275be4779a9da8，两者完整tree一致。48浏览器/22Rust、fmt/Clippy、Windows原生构建、双平台仓库检查与MSI均通过；精确记录docs/research/P2-first-loop-evidence/r11-verification.json。r11本机已下载并通过9文件白名单/8哈希/PE/MSI核验，未启动、未安装，原生验收全部待做。EXE SHA256 2a44b34a386230657ea851666236d95098713aa96c832779bbfcd59cb7e1b6eb，MSI 10d527260115af5a3ed6dc0567c256358cd3f2a76e3f51e506c8b0f77231b74b；本机交付名M1-06-preview-package-r11。新的文档证据提交不改变该候选应用源码，PR仍Draft，不自动合并。

feat/p2-desktop-loop从76658ecc（PR #30文档证据头）独立推进，不改r10包。原生desktop-entry与main共用Runtime/Store；命名持久/中转架、跨架引用事务、收起/点击展开、基础Dock每页5架、入口拖动/位置记录及工作区纠偏已写入源码。native Enter仅唤出、Drop消耗一次冻结ID目标并复用原Import/Copy；JS文件操作限制main，入口仅桌面命令。入口悬停仅SQL目录，不探测绑定磁盘；X仍隐藏到托盘。云端检查已通过，新二进制原生体验尚待验证，不能继承r10结论。未实现智能贴边/自动隐藏、每架独立展开窗口、独立管理中心。见docs/stages/P2-development-entry.md及P2-windows-acceptance.md。

## 完整制作线路

P0可靠文件流转＋P1紧凑文件架集中交付 → P2真实悬浮球/贴边/Dock/多架及按需管理中心 → P3先LAN双设备确认/受保护字节传输/哈希一致，再远程/同步 → P4先授权范围内本地跨架元数据检索，再可选AI建议与经过确认的可恢复修改。P2入口Issue #31，第一份桌面闭环正在开发，完整阶段尚未完成；不能用假动画/假AI/接口冒充真实闭环。全部43项保留。

## 持续边界

默认后台/无头/云端，不弹窗、不装软件、不操作用户鼠标键盘；重任务优先云端。仅用户明确方便时集中原生验收，r10末尾因物理Esc停止电脑控制，未继续关闭测试窗。后续“继续项目”只按后台推进，不重新操作窗口。普通可逆开发持续自主推进，不因原生待验停止所有独立工作，不宣称已经安排后台自动继续。

不扫描私人目录、不上传私人素材/数据库/凭据/私人路径/原始账号日志。临时架仅引用，绑定目录默认Copy/冲突保留，移除引用不删实体；回滚使用旧候选或revert，保留数据库、来源与旧环境，不强推、不清理用户数据。正式发行、网络外部暴露、费用/隐私AI与高风险合并各自保留人工门槛。
