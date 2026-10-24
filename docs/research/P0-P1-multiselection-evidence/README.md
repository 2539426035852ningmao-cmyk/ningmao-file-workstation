# 多选与批量拖出修复证据

2026-10-24，PR #30 / Issue #29。r9真实原生拖入/直接Copy/手柄排序已局部通过，但用户指出缺少Ctrl点选、Shift连选和空白框选，整体验收不通过。精确旧二进制证据见../P0-P1-stage-evidence/r9-native-acceptance.json，新二进制不继承这些原生结论。

先复现Ctrl第二次点选预期2项、实际仅1项；修复统一选择集合、锚点与焦点，所有拖出入口按当前筛选结果中的整组ID调用既有后端。空白处按住左键框选，实时矩形与高亮，支持Ctrl切换、Shift叠加、边缘连续滚动、Esc/失焦取消。Ctrl+A仅在文件区全选，输入框仍为文字全选；Delete仅在文件区移除当前结果里的选中引用，真实目录禁止，来源不删。多选详情显示汇总，超过64项明确拒绝、不静默截断，含异常引用整组拒绝。

保留六点手柄单项排序、原生文件拖入、单击/双击/Space、右键和引用修复。原生PointerEvent与既有TanStack固定虚拟行几何用于计算未挂载项，没有新增依赖；已评估[Selecto的DOM目标框选](https://github.com/daybrush/selecto)，本工程还须处理虚拟列表全量范围与原生Copy互斥，故复用现有原生事件与虚拟行能力，未复制上游源码。

完整44项浏览器回归和生产构建本机通过；6项新增覆盖组合选择、实时框选/取消、虚拟跨项和自动滚动、整组拖出请求、64限制、汇总及隐藏项/输入焦点保护。原右键测试还捕获React portal菜单事件被误当空白拖动的问题，现以实际DOM边界保护，既有菜单回归通过；滚动条不启动框选。

截图group-340-light.png展示三项选中且窄窗无横向溢出；marquee-420-dark.png展示鼠标仍按住时的矩形和两项持续高亮。640×720汇总、原三尺寸深浅/键盘场景由回归检查覆盖。图片是headless Chromium合成数据，不是Windows新候选验收；图片SHA256见verification.json。新EXE多选/批量OLE、重启与其他原生检查仍未执行。

## 多选修复精确候选r10

源码8ad5760279e43ba3ab306f49fa8cdbc6f0b87ade；构建779c36c11e6bd80b6bef608adb9a68ff977ef77c，完整tree d88aa1e0df182a22d68d122ebac4f0b3e864ba36一致。云端[Desktop40082824529](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/40082824529)的44浏览器/18Rust、fmt/Clippy/Windows编译通过；[Repository40082824492](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/40082824492)的Windows/Ubuntu通过；[Preview40082824542](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/40082824542)打包/检查成功。

产物12555373502，ZIP SHA256 11d699eb37b4b11f6ea51ea5ff9b1bf0b32dbfbef0d239298dea7fc96a63095a；本机下载与9文件/8哈希/PE/MSI/检查后不变已核验，268许可原文缺失0、既有映射警告1。精确[包检查](package-verification.json)与[源码身份](source-identity.json)保留。

| 文件 | 字节数 | SHA256 |
| --- | ---: | --- |
| EXE | 17748992 | a96c2f9bf2178e90a7378a1c6807de0eabdb1c3fedeb049cf589004006ebffea |
| MSI | 6148096 | 025911c6fd108b308addd4294ac10c062f9c56eb345a6a1f70dfb51a8dfb29f6 |

未安装或启动r10，真实新候选多选/批量OLE与重启等仍待用户方便时复测；不能继承r9结论，未签名debug预览不等于正式发行。

## r10真实Windows集中复测（已执行）

用户明确方便后，对上述精确r10 EXE实际复测：Ctrl选择两项后整组拖出、Shift连选、空白框选后三项整组拖出均由用户确认，全部源/目标SHA256一致，五个受保护合成对象不变。绑定目录原生选择器已实际选择合成目标，拖入三个真实文件后任务完成3/3；预置English.txt不变，新副本English (1).txt与原来源一致，中文和PNG副本一致。

正常完整退出一次后，重启同一r10：3个文件架、8条素材、原手动顺序、完成任务逻辑快照一致；窗口前后捕获尺寸均342×351，插件保存客户区物理尺寸425×400。只代表当前桌面环境，不等于DPI/多屏矩阵。标签当时为空，不能据此声称非空标签已实测。

重启后用户再次确认六点排序、空格预览/Esc关闭、双击系统默认打开正常；SQLite最终引用顺序1、2、4、3已核对，未在最后这次排序后再次重启。自动输入不能可靠触发预览/双击，以用户物理操作为实证，未把自动输入失败认定为产品故障。

机器可核查的脱敏结果见[r10-native-acceptance.json](r10-native-acceptance.json)。末尾物理Esc触发电脑控制停止，代理没有继续输入、强制结束进程或关闭窗口。核心原生复测通过；尚不等于完整产品验收、正式合并或稳定发布。安装/升级卸载、Win10/DPI/多屏、托盘/置顶、原生取消/Shift拖动、引用修复系统对话框、非空标签/会话清理及所有目标软件仍未完成；目录递归复制缺口保留。
