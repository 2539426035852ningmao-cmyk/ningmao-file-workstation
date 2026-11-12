# 柠猫 Web · 统一 UI/UX 与轻量工程实施规范

> 2026-11-09 · Web W0 基线 · 适用于 apps/web；**不覆盖**根目录 design.md、D05、P2/P3 的文件安全及现有 Windows 客户端规范。当前只引入设计与工程约束，不批量安装任何外部库。

## 1. 设计原则

**文件为主角，连接为目的，操作尽量一步到位。** 这是一款文件互传工具，不是大型网盘、AI Dashboard 或模板展示站。视觉目标：安静、克制、有产品感，功能和状态信息高于装饰。

- 登录后优先展示“选择文件/收文件/目标设备”，不出现无实际数据支撑的 KPI 卡片、热力图、浮夸 AI 动画。
- 统一 **浅白、深蓝、亮蓝** 三套独立完整主题；切换主题时整个网页统一，绝不混用入口、面板和主界面。所有颜色用语义 Token，避免散落任意十六进制值。
- 4px 基础间距节奏；控件圆角 8px、内部卡片 12px、页面容器 18–20px，按嵌套边距协调。Lucide 16/18/20px 图标，字阶精简、中文优先，长文件名安全省略且保留完整 title。
- 桌面宽度采用内容主区 + 按需状态侧区，平板及手机单列。核心文件操作不需要多层侧栏。关键按钮触控命中区优先 40px 以上。
- 必须提供 hover、focus、loading、empty、error、success、cancelled、offline、permission-denied 和 retry 的真实语义，不能用装饰假进度、假设备、假账号来填充。
- 动效仅在反馈确有帮助时使用；建议 120–180ms，支持 `prefers-reduced-motion`；传输进度必须由真实后端事件驱动，不因动画伪造。
- WCAG 常规文字对比优先 >=4.5:1，不能以亮蓝主题为理由牺牲可读性；要实测 320/375/768/1280 宽度、中文长文件名和键盘焦点。

## 2. 现有技术优先，绝不把推荐名单变成依赖清单

现有 apps/desktop 技术为 React/TypeScript、Radix、Lucide、Tailwind、dnd-kit 和已开发组件。Web W0 自主隔离但保持同源视觉，优先迁移兼容代码而不是复制整套桌面 IPC。

| 资源 | 使用定位 | 默认决策 |
| --- | --- | --- |
| shadcn/ui + Radix | 表单、对话框、菜单、无障碍状态 | 首选，按需复用；不可无目的复制/升级 |
| Lucide React | 唯一主图标体系 | 使用已有依赖 |
| Tailwind CSS | 布局与 Token（桌面现有 v4） | 当组件数量增长时复用；W0 不为改写现有 CSS 强装 |
| Motion / Bencho | 少量操作反馈/微交互参考 | 默认 CSS 转场，不安装动画引擎 |
| BoardUI | 高质量信息层级与低装饰后台参考 | 可借鉴设计原则；不执行 init 覆盖现有 Token |
| HeroUI Pro / beUI Pro | 完整产品界面/营销视觉参考 | 付费资源不自动安装、复制或购买 |
| Libraries.dev | AI/未来感特效发现 | 文件互传主界面默认不用大特效 |
| Watermelon UI | 方向探索与适配组件挑选 | 逐项审计源码、维护性与许可再选用 |
| Magic UI / Aceternity UI | 个别视觉组件候选 | 只为有明确交互目的的单个组件引入 |
| react-resizable-panels | 用户确有分屏场景时 | 首版不需要 |
| dnd-kit | 页面内部排序 | 拖入本地文件使用原生 DnD，不增加第二个拖拽系统 |
| Zustand | 跨页复杂状态增长时 | 首版 React 局部状态足够 |
| TanStack Query | 有真实远程 API 缓存/重试后 | 首版不要提前安装 |
| Recharts | 存在真实统计图表时 | 首版没有需求 |

### 参考资源

- BoardUI: https://www.boardui.com/ （免费组件及 Pro 许可证要分清，源代码不意味着所有模板自由复制）
- Bencho: https://bencho.dev/ （动态交互研究，具体复用核实授权）
- HeroUI: https://www.heroui.com/
- beUI Pro: https://pro.beui.dev/
- Libraries.dev: https://libraries.dev/
- Watermelon UI: https://ui.watermelon.sh/
- Magic UI: https://magicui.design/
- Aceternity UI: https://ui.aceternity.com/
- Radix: https://www.radix-ui.com/
- shadcn: https://ui.shadcn.com/
- Lucide: https://lucide.dev/

**许可闸门**：商用模板、付费 Pro、非标准授权示例不能仅凭网页可见就直接复制到 Apache-2.0 仓库；新增依赖/源文件都需记录来源、版本/commit、许可、打包范围及是否造成近似同类重复。

## 3. 典型页面信息架构

1. W0 公开前端壳：文件选择、待发送列表、设备/记录空态、主题与响应式
2. W1 身份与设备：账号会话、配对、设备权限、退出、撤销，不允许前端仅靠本地变量伪造认证
3. W2 真正网页 ↔ 网页：端到端文件 bytes、SHA256、接受/拒绝、取消、进度、超时、重名及断线处理
4. W3 网页 ↔ Windows：复用 Rust TransferProvider 与 jobs，对不同网络与浏览器做真实设备测试
5. W4 部署与运行：HTTPS/WSS、访问控制、成本/密钥、流量保护、移动端及多 GB 级文件

### 安全不变量

- 未取得服务端验证的身份，不能展示私有设备/记录，更不能建立文件接收授权。
- 不能把桌面 Debug-only 127.0.0.1 测试中继、测试口令及本机任意路径通过公网裸露。
- 未经用户操作，网页不得读取、上传、删除文件；默认只存浏览器内存，不保存或发送内容。
- 必须基于真实传输事件报告完成，接收方确认保存和哈希结果后才可标记 completed。
- 隐私、用户文件、凭据及个人设备信息不得进入公开仓库、PR 附件或普通 CI logs。

## 4. Codex 施工法

先阅读 `AGENTS.md`、`design.md`、`docs/execution/ACTIVE-DELIVERY.md`、本规范和最新集成候选精确 SHA。不得把 main 旧 README 当真实应用版次。保护 Windows 既有文件安全和 Draft PR，独立开发、最小可合并切片、可回滚。

每个交付必须附：源码 SHA / 依赖增量 / 构建结果 / 自动化测试 / 页面截图或浏览器交互证据 / 实际双端网络拓扑与哈希 / 未测风险 / 回滚。UI 通过不等于真实文件互传通过；未经测试不能声称“生产级上线”。

先确保用户可操作闭环，再打磨差异；不做仅截图好看的网页，不加入无业务价值的 AI 味装饰、订阅平台、统计图、重复数据库或大量第三方 skills。
