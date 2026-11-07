# 候选界面的实现说明

唯一产品设计规范为[根 design.md](../../design.md)（承接 PR #64 的 D05/v0.2）。本文件不定义第二套颜色、形态或流程。

当前应用基线为 PR #68 / 5713c47359445664d43c806322f74c3c96456b42；与 main、历史 r7/r21、#66 技术探针区分。源码存在、浏览器验证、Windows 原生验证与正式放行分别记录于 [ACTIVE-DELIVERY](../../docs/execution/ACTIVE-DELIVERY.md)。

- 日常架420×520，最小340×320，44px单行顶栏，文件内容优先。独立管理中心保留三栏目。
- 已实现球→胶囊→完整架与双启动设置；独立QuickPeek已移除。连续原生Fluid形变仍未交付。
- 白/深蓝/亮蓝完整主题跨窗共享；沿用shadcn/ui、Radix、Lucide、Tailwind和现有CSS语义变量。
- 单击选中、Space预览、双击默认打开、Ctrl/Shift多选、框选、原生Copy拖出及手柄排序保留；文件和SQLite业务不随视觉调整改变。
- 新UI/UX质量任务的问题、组件和技能审计见[审计记录](../../docs/audits/UI-UX-normalization-2026-11-08.md)。新模块不得把未通过的原生OLE/DPI/多屏测试标成PASS。

操作模式为Operate；不重新设计品牌、不增加常驻复杂导航，不使用受限第三方角色资产。所有历史审计的日期与源码边界保留。
