## 2026-10-27 最新加速交接与已运行增量

用户最新加速交接明确覆盖旧绝对串行限制：P2继续收束，允许独立P3回环/P4低风险模块并行实施；不重做问卷。不扩大到LAN/防火墙、模型/费用/隐私上传、R3阶段合并或MSI安装发布。

P2基线#40 / feat/p2-management-flow / 8ae8a590c467368178d1eaca0b017544d23d36d1，r22及已有合成原生证据保持；main仍fc8903d，未合并堆叠PR。不要重复已完成的回收/取消简单检查，也不要冒称剩余DPI/多屏等边界已通过。

P3独立feat/p3-loopback-transfer，Draft #53 / 0657a1f4d239001e18d1627fbe8fcae84718ad32。真实两个进程127.0.0.1:0经mTLS单文件、批量、哈希/来源/冲突、拒绝、恶意路径、令牌、取消、断线及证书拒绝验证PASS；Windows/Linux CI40486527337通过。仅16MiB实验，尚无流式/传输中取消，不是官方LocalSend/LAN互通交付。复用成熟Rust依赖，未复制上游代码；上游Core公开启动绑定通配地址，因此本次未直接运行。见experiments/p3-loopback/。

DevLab #52已同步P2基线，6b0dca4d8b58bbea702e33d5e66b3cba10134cba；3控制器测试+management场景14浏览器PASS，Windows/Linux CI40486952414通过。受控合成浏览器报告不冒充原生，未重建另一套控制器。

P4独立feat/p4-local-search / Draft #54：Ctrl+K只读名称/标签/类型搜索、真实身份跨架聚合与定位/选中/滚动；独立架作用域由Rust验证，DTO无路径/正文/标签列表，schema2不变。源c729e3c已有本机EXE与原生中文聚合/绑定架定位/CtrlF抽样PASS，PID37392正常退出；后续仅修主题缓变并补证据。Rust全量、Clippy、类型/构建通过；首次全量浏览器105PASS/1测试等待条件FAIL，修后定向PASS。最终CI、候选哈希与边界以docs/research/P4-local-search-evidence/为准。不是完整P4-A：FTS/增量索引/来源状态表单/规模评估尚未完成；不要做任何全盘扫描或模型下载。

当前测试程序已退出，无LAN监听。Windows新独立窗冷启动定位、原生管理中心跨窗、Win10/DPI/多屏仍未测。两个功能PR保持Draft，后续按已有质量门槛推进，不自动合并或把候选DB覆盖用户库。

# 项目交接记忆

## 当前有效检查点（2026-10-27，优先于下方历史“当前任务”措辞）

用户已明确批准仅合成English.txt（42字节）进入Windows回收站。本轮r22原生实体回收/跨架失效/软件记录恢复/Windows实体还原/重启防重放PASS（只此子集）：旧300s票据到期正确拒绝且无操作，正常重新预览同一文件；单文件二次确认后仅发起引用1进软回收，架4引用88失效且精选标签保留，journal1 committed。软件恢复还原ID1/标签但实体仍不在；Windows单项属性匹配42字节/删除时刻，点击还原回到原路径且SHA256一致。两架刷新/重启均正常，原顺序/标签保留。5小保护文件、256源别名/64MiB载荷、81独立副本hash不变；87引用/schema2完整，数据六表等于前基线，正常退出重启七表不变、无重复回收。PID15424/30128均正常退出，测试窗口为零，回收站/属性标签已关闭，原Explorer测试文件夹保留。详见r22-system-recycle-native.json；之前“待批准/仍运行”段落是旧检查点，已由本段收束。不改业务代码/权限/包，不合并/发布；P2仍PARTIAL，原生批量/回收取消/更多异常、Dock/托盘/DPI多屏仍独立门槛。b06a4bd Desktop40451577252/Preview40451577263已全绿。

原生取消关卡新增PASS（精确r22不变）：新D盘合成root，256个普通硬链接路径共享64MiB源（不使用私人素材/网络/调速）。真实复制中一次点击，实际显示81/256、“取消中…”禁用与等待提示，随后主架/管理/DB一致cancelled80/256；80目标逐一hash正确，256来源别名/载荷及5旧小文件不变，无staging。只重选未完成batch-080，job2 completed1/1，旧job1仍cancelled，81目标hash正确。PID41044正常退出，PID15424重启后七表完全不变、86持久引用/81副本，原生任务抽屉两终态保留，无自动续传。见r22-inflight-cancel-native.json；旧16MiB漏测记录保留。4042c02 Desktop40447931992/Preview40447932757已全SUCCESS。P2仍PARTIAL。

另已在当前重启实例原生创建持久架4“回收关联验证”，为合成English引用1标记精选并复制引用到架4（新ID88、标签相同）。实体回收预览仅42字节English.txt、其他引用1项；来源存在、journal0、回收前备份完成。已通过异步问题请求此次界面删除的action-time确认（computer-use规则，即使广泛授权仍须确认），未收到批准不可执行。当前停在预览（未点继续/未回收），PID15424仍运行；此与此前正常退出的取消检查点分开记录。不能写所有程序已退出或实体回收PASS。

另用新合成root复用原fixture，原生选择256×64KiB（16MiB）批次，管理自动进度15/38/256与主架compact进度已捕获、两窗完成256/256一致。取消点击执行前已完成，因此原生取消仍NOT_TESTED，不虚构通过/产品FAIL且未重复尝试。256副本逐一hash一致、261保护对象不变、无staging；正常退出PID19952、261持久引用、schema2完整。见docs/research/P2-closeout-evidence/r22-batch-progress-native.json。恢复测试提交c016973的Desktop40447123100/Preview40447123057已SUCCESS；只读证据提交的最新Checks需实时核查。

新增r22真实恢复闭环完成：EXE48993a4a…2fd30不变，新合成root与显式ignored Store fixture预置零活跃架、整架及单项回收。原生空状态新建ID3，恢复整架1保留身份/标签/顺序且不连带恢复单项；单项恢复后顺序3/1/2。正常退出/重启、来源暂改名→引用失效→原路径返回→正常，七表逻辑不变、三来源hash不变、schema2完整。两个PID36648/40636均正常结束、窗口为零。10回收后端测试+新fixture1通过。仅测试/证据变更，不改运行代码、不重建替换r22；未执行原生移除/清理/Windows回收，不能把预置状态冒称这些UI通过。详见docs/research/P2-closeout-evidence/r22-recovery-native.json。P2仍PARTIAL，下一优先取消/中断、Dock、托盘/DPI多屏，R3合并未批准。

最新缺陷：r21真实目标目录占用失败已复现，数据库/管理显示failed0/1而主架停留“复制任务已开始”。数据安全和释放占用后的重试通过（10保护文件不变、8记录/4任务、1失败3完成、schema2完整），旧r21已正常退出并保留备份。正在同一#40仅修前端启动提示覆盖已观察终态的时序：3个失败/成功/取消用例已红→绿，文件架10专项通过；r22现已精确构建/原生复测：功能源4f2f8cb，构建8875147，EXE48993a4a…2fd30，MSI0c105f4b…6ddcc；主架/管理/DB对真实失败0/1与释放后成功1/1一致，6保护文件不变，无staging泄漏，正常退出。102浏览器/69Rust/CI/包核验通过；仅该子集PASS，不能将r21 FAIL擦成PASS或继承其他旧项。无Rust/DB/依赖/权限修改或合并。

唯一主线仍P2，r21源码7621093/EXEc119311a…8f76a不变，未安装/发布/合并main。最新普通桌面测试授权有效，不沿用历史输入禁令；其他R3/LAN/费用/私人文件门槛不变。今日已在真实r21自动核验框选/CtrlA/Esc、置顶与非置顶遮挡/唤出、最小化找回不强行恢复、X隐藏、快捷键禁用/再启用、球/胶囊/轻预览及聚焦CtrlEnter直达；正常退出后Win32释放探针1PASS。9个合成文件hash及SQLite全部逻辑内容不变，G配置恢复，程序已退出；原生总体仍PARTIAL。完整增量在docs/research/P2-closeout-evidence/r21-native-session.json的followupSessions，矩阵已更新。不要冒称托盘菜单/实际Dock拖入/进度取消/回收/Win10/DPI多屏或手柄排序已通过。#52外部场景CLI独立，后续先复用现有Rust fixture继续DLV-2真实合成后端切片，不加入发行版诊断权限。



2026-10-25当前任务已切入UI-B01～B07集中实施：用户完整总指令归档docs/execution/ui-b01-b07-2026-10-25.md，从#35实际HEAD97f779e起feat/ui-b01-b07。三份正式设计资料取自d29d630，按一个集中Draft/S0→S4推进，r16用户试用包保持原样。S0两项SQLite和三项UI行为已实际红态，不把失败用例写通过；任务见docs/tasks/UI-B01-B07.md。默认后台，无新桌面许可，不用真实数据试schema/Windows回收。R3隔离编码和自行生成合成数据的受控测试已授权，不合并/安装/发布。


2026-10-25当前交付给用户自主试用：V0.1 r16，outputs/Ningmao-r16-user-trial-20261025及同名ZIP（约12MB）。原r16 EXE哈希不变，完整9文件包保留；根目录开始试用.cmd仅设进程NINGMAO_DATA_DIR/WEBVIEW2_USER_DATA_FOLDER到独立trial-data/trial-webview，不安装、不改全局配置。附中文说明、按美术/交互/动画/操作四类反馈记录及合成素材；未带此前测试DB/缓存，未自动启动。ZIP af15d414130c0b110c8ce8a336911e94228e5ebbc6ff034a850c393b60a88dd7，CRC/ZIP内EXE与实测r16一致。用户接下来会自行基础试用并分批反馈；收到反馈先核对r16事实与设计规范，默认后台、不抢窗口、不自动升级其试用包。公开脱敏交付记录见docs/research/dual-eye-orb-evidence/user-trial-delivery.json。


## 最新收尾：D-ORB r16（2026-10-25）

Draft PR #35 / Issue #34，修复源码fdf71b9，构建80a1efd，完整tree5325f246相同；80浏览器/36Rust/Windows/MSI/双平台仓库通过，精确包另存r16，EXE a6099f202e2dfee3fbb92b2130070e09aa7469ca7e5236f44cc406c0a9c5b359。本机包核验通过。详见docs/research/dual-eye-orb-evidence/README.md与r16-verification.json。

集中桌面许可已完成本轮工作，r15与r16均通过菜单正常退出，PID13092/37788已不存在，未强杀、安装、合并或发布；现在回到后台，不再凭旧方便许可随机重开窗口。实际球/胶囊/轻预览/自身收起、两条引用、r15两份编号Copy和r16一份、哈希来源保护、退出恢复抽样有效。r15提示截断FAIL已新增红断言并修复，r16短字完整用户确认。Leave取消6记录/3任务/4文件零变化；用户另试过复制/排序/主题/尺寸，不当受控测试。重新基线9记录/6任务/5文件后约3次右键取消全部零变化，Windows11 Explorer→柠猫原生已支持，无新增全局监听；其他来源不保证。最终正常退出后记录/任务及5保护对象不变，SQLite完整。

完整D-ORB/P2、最终视觉与27项原生/DPI/多屏/独立架/完整文件交互/性能仍需验收。旧99b69a2一次旧排序菜单focus CI失败78/79保留，新fdf71b9完整80通过，不跳过/新增retry。当前优先整理PR/Issue与证据，不继续重复拖同一旧包；全部43项、原design.md、P0→P4线路及不自动合并/安装/发布约束不变。旧r14在本轮初始未发现，不虚构其正常退出。

更新：2026-10-25。本文件是继续工作的索引，以精确源码、CI、产物与真实操作为准。

## 最新授权与当前验收

2026-10-25最新任务转入PR #33 / Issue #34原创双眼入口；不自动合并/安装/发布，默认后台。先在本分支收尾r14，再以真实P2祖先建立独立UI分支，导入设计资料但不把待视觉验收文档冒充已批准主规范。

r14后续已获用户另一次集中许可并启动：固定bound-target入口实际产生English (2)/(3)/(4).txt，3份均与来源哈希一致、旧目标和5个保护文件不变；用户明确“约3次投放”，对应3个completed任务，不能冒称严格单次事件去重已追踪。Esc取消后7文件/4任务/12记录完全不变，SQLite完整。置顶菜单恢复已勾选、X隐藏/托盘找回/独立架菜单恢复抽样通过。用户报告看不出投放反应，成功提示FAIL R2。按要求按Esc同时触发电脑工具停止，未继续操作；正常退出NOT COMPLETED，不能强杀或宣称已退出。见docs/research/P2-detached-shelves-evidence/r14-native-acceptance.json。r13原FAIL保留，r14不是完整P2通过；细柄自动隐藏、引用目标、严格单次、多DPI/多屏/安装等仍未测。下列“未启动”为原交付历史。

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


## D-ORB 当前接手点（2026-10-25）

独立feat/dual-eye-orb / Draft PR #35，以P2残留证据63377ae为祖先，不改变main/#30/#32。设计合同来自#33精确8b3ccb1；Issue #34。新原创球/胶囊/轻预览/完整架自身收起和横竖Dock已接通；三皮肤独立主题；轻预览登记引用最多3项、更多架检索。窗口/目标矩形由Rust拥有，拖放期间冻结、不每帧改窗口。v4布局独立保留v1/v2/v3，DB schema/Copy/多选排序身份未改。详见docs/tasks/D-ORB-implementation.md。当前任务禁止任何自动合并、安装、发布；最终视觉和真实Windows回归仍需验收。默认后台，不恢复先前被物理Esc停止的电脑工具、不强杀旧r14。真实r14复制/取消仅对旧精确包有效，新UI不能继承。全部43项和P0→P4路线保留，先P2再P3/P4。


D-ORB精确r15已构建/核验：源f7673e6，构建5807e05，完整tree相同，79浏览器/36Rust/Windows/MSI/双平台仓库通过；见docs/research/dual-eye-orb-evidence/verification.json。三皮肤双主题图与浏览器录像已保留。用户另行明确现在方便，已原生启动隔离r15 PID13092；main收起/球→胶囊→QuickPeek空态→球已观察，SQLite初始0记录/0任务，5保护对象不变。已选source/English.txt并请用户只拖到白球正中松开一次，当前等待回复/真实Drop；不要把这一等待写成复制已通过。详见native-session.json。未装MSI/合并/发布，Windows完整矩阵/最终视觉仍待验。当前只允许此集中合成验收，不碰私人软件；工具若因物理Esc停止立即停输入。


r15集中验收继续：第一次English引用后1条/0任务，第二次用户明确胶囊投放中文且见接收文字；SQLite现在2条持久引用/0任务、完整，5保护对象哈希不变。反馈文字过长截断=FAIL R2。已新增真实红断言并在fdf71b9修为短胶囊提示（已接收N项/复制完成/正在复制/已取消），完整原文留tooltip/QuickPeek，18专项通过；正在运行的r15没有被改动。实际QuickPeek两条/明确Open shelf→全架已观察。已用原生选择器绑定本轮D-ORB-acceptance-r15/bound-target为shelf3（不是旧r3），收起到自身胶囊，English已选中；已请用户向bound-target正中仅松开一次，等待回复。复制前3记录/0任务/1旧English目标，见work/orb-r15-before-bound-drop1.json。不要提前宣称Copy通过。

文档头99b69a2的CI有一次旧metadata-sorting窄窗focus超时（78/79），新fdf71b9浏览器已通过，未修改该排序测试或业务；完整CI状态仍需核对并如实保留间歇记录，不用旧全绿冒充新头。


- UI-B01～B07在feat/ui-b01-b07 / Draft PR #36集中实施，基于#35 HEAD 97f779e。新增schema2内部回收、单调ID和Windows严格回收；旧r16用户试用目录保持独立，不可用新库覆盖旧库。仅合成数据后台R3测试获得授权；可见Windows新候选/Explorer仍需集中许可，未安装/合并/发布。设计依据docs/tasks/UI-B01-B07.md及handoff集中指令；浏览器与Win32实测证据必须区分。

- 2026-10-26：r17构建源82f6966，EXE 8fa032f4…c1773；89浏览器/53Rust及GitHub两工作流通过，旧r16EXE哈希未变。新合成试用目录已准备，尚未启动；新的集中桌面许可问题待回复。#36保持Draft，原生视觉/DPI/多屏/窗口与拖放联合矩阵未验收即保持PENDING。

- 2026-10-26 r17已获本时段集中许可并启动，用户明确反馈顶部胶囊关闭方向、三形态锯齿、完整架系统黑标题栏/边框三组FAIL。r17已菜单完整退出，来源/旧目标5哈希不变，integrity ok，session退出清理后5引用/0任务；本轮文件拖放未做。正在同一#36修复r18（边界吸附、AA裁切物理像素余量、完整架自绘单行窗口控制），新原生视觉未验即保持PENDING。

- r18最终源b00ae956，EXE7c86466e…6f418，91浏览器/56Rust与本机包核验通过。已获本时段r18许可并运行PID40412，新数据独立；真实主窗系统标题栏移除/内置窗口操作组已观察。工具检测到用户输入，暂停鼠标键盘，等三项视觉/顶部吸边反馈。云端Desktop成功、Preview回收实体返回用例失败，测试改为符合产品串行所有权的Shell锁后本机3项通过，云端仍待复测；不修改已运行候选。

- 2026-10-26 r18用户新增FAIL：完整架圆角/顶区拖动、胶囊直接触顶、三种入口静置后顶部破边（非置顶也发生）。r19同一#36集中修复，透明背景/顶区阴影拖动、释放鼠标边缘吸附已有红绿测试；入口no_redirection_bitmap为候选合成路径修复，未原生验证不得写修好。r18仍用户控制，不强关，不修改其数据。2a两云端工作流已成功，保留此前失败。详见docs/tasks/UI-B01-B07.md末尾。

- r19源cfa01f9已构建，EXE0401c991…bc9182；92浏览器/57Rust/Clippy/9文件包核验通过，独立Ningmao-r19-user-trial-20261026已准备，未启动/安装。入口静置破边修复仍需新候选原生确认，不能冒充通过。r18仍运行且归用户控制。

- r19已获本时段集中许可启动PID16360；旧r18启动前已无进程，未强关。用户交还控制后的球/胶囊/轻预览各静置约108/109/106秒，未见明显持续扩大，但最终边缘观感/直接胶囊触顶/完整架拖动等用户回复待验；非置顶/遮挡恢复/DPI/多屏未验。本轮6引用/0任务、5文件哈希不变。当前用户接手，暂停鼠标键盘；不要再自行操作。详见r19-native.json。56e69cd两CI成功。

- 2026-10-26 r19用户对三项集中复测回复“全部通过”：展开胶囊触顶/关闭凸起下置、完整架顶区拖动/圆角、三形态边缘及此前静置破损。本组用户原生PASS，源码cfa01f9/EXE0401c991…bc9182不变；不能推断非置顶/遮挡/DPI/多屏/本轮文件拖放通过，也不证明内部根因。e0890b7两CI成功40251621223/224。r19留给用户，暂停桌面输入，不自动关闭/合并/安装/发布。报告r19-native.json。

- 用户要求收束后继续功能流程与构建；从4774ff3开feat/p2-management-flow，保留#36/r19，不自动合并。当前补管理名称+标签组合检索、现有事件驱动任务进度/排队可见、状态/架筛选和取消等待，未改Rust/DB/Copy权限；95中间全量+14管理专项已通过，最终候选构建/CI待记录。默认后台，不操作用户正在体验的r19。详见docs/stages/P2-management-flow.md。

- r20精确源16edf9a，EXE520a3dd9…4f1b7b、MSI3576e7df…7bf181；最终96浏览器（管理14）/生产构建/9文件包核验/新合成fixture通过，Rust产品与依赖未改；原生未启动/安装，下一关管理跨窗排队/进度/取消和原文件操作回归。独立Ningmao-r20-user-trial-20261026已准备，r19EXE复核不变。原生取消交互按R3，未批准不合并。详见docs/stages/P2-management-flow.md，GitHub功能PR待建立后以实际链接为准。

- P2管理功能已建立Draft PR #40（base feat/ui-b01-b07），已附到本聊天；r20产物源16edf9a，功能树由86dfecd文档提交保留。96浏览器/Windows包本机通过，GitHub Desktop与Preview初次运行进行中，以实时Checks为准。文档/路线实际入口docs/stages/P2-management-flow.md。本轮不新开原生测试，保留r19给用户。

- 2026-10-26最新顺序合同已从main b57fdc3读入（P4独立44项、原43不变）。当前fix/p2-closeout-20261026从#40起；#30两处纯文档冲突以3389a8d普通merge修复，P0/P1业务子树不变、#30/#32实时CLEAN，未合并main。r20桌面许可后只正常退出r19；用户要求停止频繁控鼠，已暂停所有桌面输入，r20未启动。后台补官方全局唤出和唤出/手动离屏找回，真实OS注册/断屏未验，P2未放行。详见docs/stages/P2-closeout-20261026.md；不启动P3/P4主程序，不再凭本轮旧许可控制桌面。

- r21构建源76210933f97d9a00b5ed8a3f4f8cd3ee24d73748，EXEc119311a…8f76a / MSI48f46a85…90c70；99浏览器/69Rust/Clippy/9文件包核验通过，2原有受控ignored保留，fresh Store准备另行通过。新增全局唤出与唤出/手动离屏恢复，旧Cargo版本全保留，272许可/1既有警示。r21未启动/安装；用户已暂停桌面输入，不能沿用旧许可。r19/r20EXE哈希不变，r20/r21合成DB本地一致性备份完成。仍P2 PARTIAL，P3/P4无运行时代码/网络/模型行为。证据docs/research/P2-closeout-evidence与集中清单已准备。

- r21收束集中更新现有Draft PR #40（不新增堆叠PR），交付分支回到feat/p2-management-flow；fix/p2-closeout-20261026保留实施/回滚点。源7621093及两份精确哈希见r21-build.json，r20证据不覆盖。#30→#32→#35→#36→#40仍依序等待原生与R3门槛，用户桌面控制已暂停，当前仅后台检查/CI。

- 2026-10-26最新用户明确解除自主开测试窗口和操作鼠标键盘两项禁令，本项目普通原生验收不再逐轮申请许可；安全/安装/合并/LAN/费用/隐私门槛不变。r21精确7621093已隔离启动，原生管理中心及默认全局唤出、暂停不唤出、恢复唤出通过；改键/冲突/退出释放/重启未验。随后捕获两次报告窗口最小化、一次截图定位失效，已暂停输入核对是否同时操作，原因未定，不记为预览FAIL或全P2通过。3架6引用0任务0回收，schema2完整、来源哈希不变。CI精确ac8a5ad两工作流全SUCCESS（云端99浏览器），见r21-ci.json、r21-native-session.json。

- 2026-10-26本轮r21原生闭环已正常退出：用户明确前次误最小化，非产品故障；Space/Esc与Ctrl两项组拖出均确认PASS，目标2副本与原来源/绑定副本SHA256一致。原生选择器两次分别Copy英文/中文（2个completed任务），中文(2)编号与旧副本保护通过；管理跨窗自动终态、QA-native标签+English组合检索、CtrlAltG改键/旧键失效/保存/正常退出重启恢复通过；7持久/绑定记录、0中转引用、2任务，schema2完整、来源不变。新增仅测试的原生RegisterHotKey探针（复用windows依赖、默认ignored）实测运行时冲突1409、退出后空闲注册/释放各1PASS，targeted Clippy通过；不修改应用/权限/依赖，不重打MSI。用户要求基础回归自主自动化，不再逐项人工问验。最新完整接管文件已读，main推进fc8903d后#30再次DIRTY，先收束本轮再修文档冲突；继而独立DLV-0/1实测CI环境提速，P2仍PARTIAL，DLV-3/P3/P4不越门槛。

- 2026-10-26已普通merge解决main fc8903d给#30带来的六份治理文档冲突（3651746）；#30新增等待异步导入完成的测试前提，完整44/44约1.1m，原单跑也1/1故不宣称唯一根因被稳定复现；所有断言保留。原浏览器15m预算遇13m11依赖准备被取消，改20m容纳完整回归，不称提速。#40继承本轮测试/CI差异，产品运行时代码及r21包未改，无新MSI。独立Draft #51官方预装镜像与原路线同SHA各99PASS，但167s比151s慢16s，停止推广默认；真实结果已更新Issue49，不用历史835s宣传普遍加速。P2原生剩余/合并仍未通过，下一步复用Harness做最小外部场景命令，不增加发行版诊断权限。

- 2026-10-26依赖链同步：#30 35143d2已CI成功且CLEAN；后续#32因基线更新实际出现5份治理文档与1份测试冲突，已普通merge d2f3444，再沿#35 ffbf2ed→#36 85fd45d回到#40，均逐步确认运行时代码/锁文件无变化，不强推、不合并main。DevLab DLV-2浏览器首切片在独立Draft #52 / 507891f，6/18/14场景本机PASS、控制器守护双平台CI PASS，原生诊断/真实Copy未实现。r21 EXE复核仍c119311a…8f76a，当前程序已退出；剩余Native/R3仍不放行。

- 最新工具授权（2026-10-27）：用户明确允许按需自主安装并使用其他软件、插件、技能及GitHub项目。不为安装而安装，先复用已装工具并核许可；不等同于安装本项目MSI/发布/高风险合并、收费、账号授权或绕过安全策略。当前修复未引入或安装新工具。
