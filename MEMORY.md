# 项目交接记忆

更新：2026-10-24；记忆是索引，以精确源码、CI、产物和实测为准。

## 当前入口

先读AGENTS.md、docs/product-decisions.md、docs/execution/v0.1-p0-p4-2026-10-24.md、design.md、apps/desktop/DESIGN.md、docs/codex-start-here.md与docs/roadmap.md。全部43项冻结决策保留，唯一工程apps/desktop（Tauri2/Rust/React/TypeScript/SQLite；shadcn/ui主、SpaceUI仅FileThumb）。

正式稳定发行版：尚无。main规范基线8ca3064f2fec063bbacc0fd7df8dfb541138163f；当前开发入口integration/v0.1-p0-p1 / Issue #29。阶段PR和产物身份见[集成记录](docs/stages/P0-P1-integration.md)。不再围绕单个按钮拆分长期Draft。

## 已收束与未通过

- M1-01/02/03已验收；M1-04技术选择获准。#9→#11→#13→#21→#22→#24→#26→#28是祖先链，最新功能底座6b66c52543857a12a1d8402da518e6383e664aab完整包含引用、Copy、SQLite、打包、引用修复、默认打开、紧凑架、视图、排序、筛选。
- #9相对main不可合并的原因已由merge-tree复现：4份文档冲突，无Rust/SQLite冲突。07ca2736b7346994ac13d92bdc7969211ed7d243已从#28受控合入main规范，未改应用/安全代码。
- 本阶段卡片移动6px请求既有原生Copy，六点手柄仍排序，显式拖出按钮保留；正式与preview共用420×520/最小340×320。官方window-state2.5.0仅保存尺寸，无前端权限增加，无DB迁移。
- 本机38项浏览器与生产构建通过；旧r8为34浏览器/18Rust。最终Windows构建、18Rust、Clippy、许可和精确新产物以阶段PR证据为准，不能继承旧EXE的原生结论。
- [集中实机清单](docs/stages/P0-P1-windows-acceptance.md)：新EXE的OLE拖入拖出、来源保留、排序共存、重启恢复、DPI/多屏、目标软件兼容、默认打开与窗口尺寸恢复仍待用户方便时检查；未安装/启动。
- [Issue #17](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/issues/17)：Gemini仍未恢复，0模型请求。登录/Pro/额外点数关闭状态未知，既有代理可达不等于OAuth成功；不得绕过策略或宣称双AI验证。#19公开脱敏诊断文档已保留原始blob f8825c47b8fd23a2c565a9b19a89cd399106be02。

## 制作线路

按完整阶段：P0可靠文件流转＋P1紧凑小窗集中交付 → P2真悬浮球/贴边/Dock/多架与按需管理中心 → P3先LAN真实双端受保护传输、再远程/同步 → P4先授权范围内跨架本地检索、再可选AI建议与受控修改。具体闭环和验收以正式指令为准，禁止模拟响应冒充真实功能。

P2直接复用当前Tauri窗口、Store与数据身份，不另建文件存储；可在P0/P1集中验收等待期间准备独立低风险代码。不能将文件安全未验收版本发布为稳定版，不能自动合并高风险代码。

## 持续边界

- 默认后台/无头/云端；不打开可见窗口、Explorer、安装器或模拟鼠标键盘。仅用户明确方便时集中验收，重任务优先云端。
- 临时架仅引用；绑定目录默认Copy、冲突编号、保留来源；移除引用不删实体；不扫描私人目录、不上传素材/数据库/凭据/本地原始日志。
- 历史r1–r8、分支、脚本保留；回滚按提交revert或使用旧候选，不删除用户数据，不强推。尺寸建议仍待验收，窗口记忆仅完整退出保证保存。
- main保护与人工文件安全/正式视觉/重大架构/权限/正式发布门槛保留。已授权可逆开发自主推进，真实阻碍才交还用户；不以尚未进行的原生验收阻断所有独立工作。
