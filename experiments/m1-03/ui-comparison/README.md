# M1-03 双 UI 技术样机

同一份界面结构、合成素材、1120×760 初始逻辑尺寸、dnd-kit pointer 排序和 TanStack Virtual 列表，分别接入 SpaceUI 和 shadcn/ui 的固定版本组件。不是两张静态配色图，也不是最终主工程或正式文件管理器。

SpaceUI 源码：`a48b17047d3ff1d05268acb6f88a79460ad4fa7b`；shadcn/ui：`3d98900e9b73c45f035f8109e9d41ba6a51685e7`。复制范围、轻量改动和许可证见同级 `../licenses/` 及 `../source-provenance.json`。SpaceUI README 列出的全部 Explorer 组件未必在此提交中存在，以实际源码为准。

## 构建和验证

需要 Node.js 24、PowerShell 7。仓库根目录：

```powershell
pwsh -NoProfile -File scripts/m1-03/build-ui.ps1 -Browser
```

Windows 安装 Rust 1.99.1、MSVC/Windows SDK、WebView2 后：

```powershell
pwsh -NoProfile -File scripts/m1-03/build-ui.ps1 -Native
```

默认原生输出在 `src-tauri/target/debug/ningmao-m103-ui-comparison.exe`；自定义 `CARGO_TARGET_DIR` 时以该目录为准。网页预览可在本目录执行 `npm run preview -- --port 1430`，打开 `http://127.0.0.1:1430/?variant=spaceui` 或 `?variant=shadcn`。`theme=light`、`count=2000`、`view=list` 可复现对比条件。

浏览器测试使用独立 Playwright Test CLI，不依赖未配置的 Playwright MCP。浏览器回归和原生 Windows 测试分别记录，不能互相替代。

## 验收操作

1. 右上选择 A/B，切换深浅主题。两套有相同功能和数据，组件及 token 来自各自设计系统。
2. 试网格/列表、缩略图尺寸、名称/手动排序、中文搜索、分组折叠与标签筛选。切到名称排序后拖动手柄禁用，手动顺序保留。
3. 单击选择显示操作；双击或“详情”打开详情；宽窗为右侧面板，小窗为抽屉。预览可按空格开启，Escape 关闭，键盘焦点返回原控件。
4. 鼠标移到卡片左上方出现手柄，拖到另一张卡片上改变样本引用顺序；过程中显示浮层。右键可查看详情、切换标签、移除样本引用。
5. 底部展开测试设置，可重置素材、切换 500/2000 项及运行 90 帧程序滚动采样。记录的是 RAF 帧间隔、可见 DOM 数及环境，不是人工输入延迟或 Release FPS 承诺。
6. 原生模式两个窗口均启用 Tauri 文件接收。“合成文件目录”只打开探针自建目录；真实拖入仅记录文件名事件，不建立正式引用。两个拖出按钮只允许两个已知合成文件并强制复制，复用 M1-02 后端。

原生运行可用 `NINGMAO_M103_RUN_ROOT` 指定专用测试根目录；默认写自身应用数据目录下 `m1-03-synthetic`。没有磁盘删除、任意目录扫描、正式持久化或目录绑定能力。合成文件内容沿用 M1-02，便于核对相同哈希。

## 范围

本阶段只比较既定 UI 候选，原型配色与布局不构成用户对最终视觉的批准。跨应用拖放、Win10、多屏、其他 DPI、真实工作负载及正式发布许可审查的未测项应继续明确保留。选型在 M1-04 由用户批准后再落地。
