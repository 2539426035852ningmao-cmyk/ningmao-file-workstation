# 能力面板的紧凑适配

2026-11-05，`feat/capability-panels-polish`，基于集成 #57；不包含 #59 的浏览器互传实验。

互传将选中项、连接信息和任务反馈分组；复用已有 Radix Tabs 提供方向键/焦点语义，SHA256 输入区可显示两行，未选文件给出操作引导。AI 提供未配置直达设置、明确的返回对话、独立设置操作区。全部使用现有表面、边框、蓝色强调及420宽/340最小宽，不增加常驻导航、假按钮或新依赖。

`npm run build:test`、`npm run build` PASS；`npx playwright test tests/browser/transfer.spec.ts tests/browser/chat.spec.ts` 10/10 PASS（22.5秒）。覆盖互传键盘切换、零选择禁用、剪贴板、固定ID发送/取消、聊天配置/返回/停止、340×320深浅主题可达与无横向溢出。生产构建无新的分块告警；测试Harness有既有大chunk提示。

四张 PNG 均为340×320浏览器合成Harness截图，滚动到关键操作区；不是Windows原生或真实网络截图。已人工看浅色互传和深色AI设置，按钮/指纹无裁切，其他截图供复核。未改后端、数据库或安全Copy。Windows CI/新包/原生体验以PR最新结果为准；旧r4不覆盖。回滚可不合入此局部UI候选。
