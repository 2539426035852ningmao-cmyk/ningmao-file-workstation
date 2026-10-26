# P2直接开发入口 · 悬浮入口、文件架与Dock闭环

状态：源码复用点已核对，尚未实现P2。基线为PR #30的P0/P1集成，保留该精确候选独立验收与回滚，不向旧堆叠PR追加功能。

## 已有能力与真实缺口

| 现有源码 | 直接复用 | P2需要补齐 |
| --- | --- | --- |
| apps/desktop/src-tauri/src/lib.rs | Runtime单实例/Store、受ID约束的Copy、托盘、关闭隐藏、置顶、完整退出拒绝活动任务 | Rust管理orb/shelf/Dock可见性；拖近唤出与投放目标固定；窗口事件与恢复 |
| apps/desktop/src-tauri/src/store.rs | shelves/items/jobs与已有persistent/session/bound类型；绑定目录创建、已有架切换 | 用户创建命名的持久架/中转架、跨架引用事务；不移动磁盘文件；无需为新架破坏schema1 |
| apps/desktop/src/backend.ts | Snapshot与文件事件订阅，引用/复制/进度/取消通道 | 窗口角色和目标shelf明确绑定；多个WebView事件不能误导入当前活动架 |
| apps/desktop/src/App.tsx、ShelfMenu | 现有紧凑文件架、按需操作、视图记忆 | 初始目标架由窗口上下文提供；独立轻量入口和按需管理中心复用同一数据服务 |
| tauri-plugin-window-state2.5.0 | 当前仅SIZE，不扩大现有行为 | 独立桌面布局记录要区分orb/shelf尺寸、显示器和贴边状态；断屏纠偏与手动调整优先 |
| experiments/m1-02/tauri-baseline | 已验证双WebView、置顶、托盘和快捷键探针 | 不继承探针原生结论；只复用成熟原生API，不整体重搬探针 |

## 实施切面与第一份可运行候选

1. 先新增Rust桌面控制层，管理同进程orb与main；使用Tauri既有WebviewWindowBuilder、show/hide、start_dragging、set_position/set_size/set_always_on_top、Monitor.work_area/scale_factor。当前Cargo.lock固定tauri2.12.5，本机该版本源码已逐项查到，不需新窗口框架。
2. 先定义并测试展开/收起、拖动中不收起、投放目标锁定、负坐标显示器/DPI纠偏和断屏可见恢复。集中运行候选证明真实原生窗口存在，不用CSS圆球冒充系统入口。
3. 沿用Store新增架与跨架仅引用操作，验证失败事务无半写入；目录目标仍走既有安全Copy任务，不复用任意路径IPC。文件内容、标签、顺序和退出恢复一起回归。
4. 收起架聚合到基础Dock，点击恢复目标架；原生drag enter只展开，不在enter导入；仅drop一次导入确定目标。延迟隐藏期间保持接收窗口，不能中途销毁OLE目标。
5. 贴边/自动隐藏、自由拖动与置顶开关、位置/显示器恢复、关闭到托盘/完整退出形成同一候选。管理中心按需打开，先接总览/素材/标签/搜索/任务/简单设置；未来设备/AI显示明确不可用状态，不造假交互。

全部使用同一Runtime与Store，不增加第二套复制实现或后台磁盘扫描。窗口角色/target-shelf须Rust验证；capability按具体label列举，不使用通配远程来源或任意文件路径权限。全局快捷键只在用户设置时注册，冲突可报告，不改系统快捷键。

## 集中验收与边界

orb点击展开 → 实际拖入合成文件 → 整理/复制 → 收回 → 拖近安全展开 → 投放 → 多架Dock再展开 → 完整退出重启恢复；125%/150%及多屏分别记录。自动状态测试和浏览器测试不代替这条原生链路。验收前仅后台编译、无头和CI，不启动窗口。P0/P1文件安全批准与P2窗口/视觉批准分别记录，不自动合并高风险代码。

成熟来源：现有Tauri2.12.5 API及官方window-state2.5.0（许可见docs/third-party.md）；已核对的Holdem3.1.1/MIT原生窗口研究见docs/research/M1-02-comparison.md，原CopyOrMove、单架互斥、失效引用过滤不适用于本产品，不原样引入。本文未复制新增上游代码，也不声称P2已经运行。
