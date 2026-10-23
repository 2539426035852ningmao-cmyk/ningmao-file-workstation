# 主工程界面约束

本页只补充当前候选的实施状态。产品设计以默认分支的 [根目录 design.md](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/main/design.md) 为准，制作顺序见 [roadmap.md](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/blob/main/docs/roadmap.md)；旧候选分支缺少这些文件时先读取 main，不能另建冲突规范。建议尺寸与最终视觉仍待验收。

交互沿用冻结第 6 项：单击选中，空格预览，双击系统默认程序打开；详情从显式按钮或右键进入。当前修复不改变窗口布局、不批准最终视觉方案。

模式：Operate。用户已验收 M1-03，并于 2026-10-23 授权按照推荐方案继续。

沿用已比较的 shadcn/ui 深浅色、蓝色强调色、系统中文字体与文件视图；SpaceUI 仅复用 FileThumb，不加载第二套主题/通用控件。文件是主内容，不新增品牌画面或概念方向。

临时架常态显示“仅保存引用”，绑定目录显示“复制并保留来源”。错误不只依赖颜色，失效引用保留名称、标签与路径。默认隐藏详情，窄窗用已验证 Sheet。进度与取消在任务区呈现。复杂 Dock、管理中心与实体删除不在此闭环中实现，43 项完整需求保留。
