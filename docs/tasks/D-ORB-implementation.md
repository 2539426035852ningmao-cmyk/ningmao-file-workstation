# D-ORB · 原创双眼入口实施记录

2026-10-25，关联Issue #34 / 设计PR #33。实施基线为P2 `63377aea1e8831a26d424e65dea78d63a86a01f0`，祖先含PR #30 `76658ecc363a4a9740f38282b125bbc265497d4b`及main `8ca3064f2fec063bbacc0fd7df8dfb541138163f`。独立分支feat/dual-eye-orb，不从main重造文件功能，不自动合并、安装或发布。

设计资料逐文件取自本仓设计分支 `8b3ccb1e6c39e972efcd565966435cf2f916e71a`，作为待验收实施合同；root design.md仍为规范主源，最终视觉待用户验收。没有合并PR #33或改变其状态。

## 前置事实与残留

r13 Dock原生FAIL保留。精确r14绑定架固定入口已经真实接收约3次投放，产生3份哈希一致副本/3任务；旧目标与5保护文件不变。Esc取消后7文件/4任务/12记录完全不变、SQLite完整。成功反馈仍FAIL R2；严格单次OS事件追踪、引用目标、隐藏细柄和DPI矩阵尚未完成。按Esc也停止电脑工具，正常退出NOT COMPLETED；当前新任务只后台工作，不因此强杀r14或操作旧r10。见[r14原生证据](../research/P2-detached-shelves-evidence/r14-native-acceptance.json)。新UI改变入口几何后必须重新验证，不能继承r14。

## 实施边界

`OrbFace / bounded motion → entry presentation → native window coordinator → frozen shelf ID → existing Store/Copy`。

- 原创两眼曲线、三款独立皮肤、按需单心跳；球/胶囊/轻预览共用几何语言，完整架只加装饰双眼与专用收起。
- 原生窗口仅在明确状态切换时调整几何；拖入会话冻结目标和命中矩形，禁止变形/翻页/切换。Drop才导入，Leave/Esc解锁，不另建文件管线。
- 轻预览只读已登记目标的最多3项，缩略图复用既有受限解码器；不向入口开放任意路径、磁盘扫描、文件修改或JS窗口创建权限。
- 横/竖Dock及新增布局字段使用独立版本文件，保留旧v1/v2/v3；SQLite文件身份和schema、原Copy/冲突/打开/选择/排序业务不改。
- 新窗口协调和布局属于R3候选代码，实际前台启用、最终视觉及合并保留门槛；默认只做无头和云端检查。

## 原创与许可

只读核查2026-10-25的公开README/许可，不取第三方角色/引擎代码或数据进入仓库、依赖、构建和发行物。

| 参考 | 固定研究提交 | 处理 |
| --- | --- | --- |
| [grok-icon-study](https://github.com/blessonism/grok-icon-study/tree/b7e6cd48db4eeba13271c653c38e1ad0f48037b4) | b7e6cd48db4eeba13271c653c38e1ad0f48037b4 | README限制商业/再分发且涉及提取材料；仅理解通用姿态/弹簧概念，不取extracted/replica/几何/商标。 |
| [aora-bot](https://github.com/sam70361/aora-bot/tree/e3b6148c818da4a8e1966f2bc89cdb3cee473b73) | e3b6148c818da4a8e1966f2bc89cdb3cee473b73 | LICENSE社区许可及NOTICE限制，不能当Apache兼容直接依赖；仅理解配置/状态/节能原则，不取引擎、表情参数或视觉。 |

代码、眼睛路径、参数独立编写。仅复用本仓已锁定React、Radix、Lucide、Tauri与原有解码器，不新增第三方动画依赖。公开研究不是授权或法律清算；本记录不声称取得上述受限内容的商业权利。

## 质量与交付

按设计UI-01..12/NATIVE-01..10/PERF-01..02/A11Y-01..03记录。浏览器截图/录屏明确为合成界面；真实Windows样机需精确源码/构建/哈希、原生投放取消及既有文件回归。Win10/11、125%/150%、多屏没有实测就NOT TESTED。保留所有历史候选，回滚本UI分支与新版布局，不删除数据或降级覆盖旧布局。

当前：已核查基线及许可、归档r14后续证据、导入设计合同；尚未宣布UI实现或新原生通过。
