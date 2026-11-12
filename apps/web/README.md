# 柠猫 Transfer · Web

本目录是 **W0 可运行网页基础版**。其目标不是替代 Windows 文件架，而是在浏览器中建立简洁、一致的跨设备文件入口。

## 本地运行

使用 Node.js 22+，在 `apps/web` 执行：

```bash
npm install
npm run test
npm run build
npm run dev
```

打开终端显示的本地 Vite 地址。构建输出为 `dist/`，可作为静态网页部署的前端资源，但**部署静态文件不会自动实现身份认证和跨网传输**。

## 已实现

- React + Vite + TypeScript 前端应用、响应式侧栏及移动导航
- 完整的浅白、深蓝、亮蓝三主题切换，浏览器本地保存偏好
- 浏览器原生多文件选择、拖放添加、去重、大小统计、移除与清空
- 我的设备、传输记录的明确空状态，未接入的发送/接收动作禁用
- 不读取磁盘路径，不上传文件，不伪造设备、账号、传输进度或成功状态

## 未实现 / 下一阶段

- W1：身份验证、账号会话、设备绑定和撤销；必须由服务端验证身份
- W2：浏览器到浏览器的真实安全传输，接受/拒绝、取消、内容哈希、超时处理
- W3：与现有 Rust TransferProvider 和 jobs 协作，网页 ↔ Windows 客户端双向互传
- W4：不同网络、移动设备、超大文件、断点恢复、网络中继和真实部署证据

任何公网入口必须先部署身份保护并做服务端权限检查，不得直接暴露已有 Debug localhost relay，尤其不能复制开发固定口令。Access 和用户数据库属于不同层次，不能以静态前端会话模拟登录。

设计与依赖约束见 `../../docs/design/WEB-UI-ENGINEERING-2026-11-09.md`。

## 验收

W0 需要在 Chrome/Edge 和至少一个手机尺寸验证：主题切换、刷新偏好、文件拖入/选择/去重/删除、键盘焦点、文字可读性；还需记录实际 npm 构建和测试。此提交仅提供可运行源码与 Node 单测，CI/浏览器/实际联网结果分别报告，不将代码提交视作全部验收通过。

## 公开 UI 预览发布（GitHub Pages）

- 源码与自动构建：`feat/web-transfer-foundation-20261109`（PR #79），**与 W1–W4 的 PR #80 分离**。
- 仅发布 `apps/web/dist` 到独立 `gh-pages` 分支；不包含 Rust、SQLite、源素材或服务器密钥。
- Actions：`.github/workflows/web-preview-pages.yml` 在 W0 分支推送时构建与更新预览，不自动合并进 `main`。
- 仓库所有者首次需要打开 [Settings → Pages](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/settings/pages)；选 `Deploy from a branch`，Branch = `gh-pages`、Folder = `/(root)`，保存。
- **预期地址**：`https://2539426035852ningmao-cmyk.github.io/ningmao-file-workstation/`。只有实际出现 Pages 成功部署且地址返回完整网页后才能称其“上线”；Pages 没启用时此地址可能 404。
- 页面能够拖入/选择/移除文件、切换三套完整主题和显示空态；未对接服务器的发送、接收、在线设备按钮明确禁用。静态预览**不会上传用户文件，也不会允许公网登录/传输**。
- 回滚：在仓库 Settings → Pages 将 Source 设为 Disable 或停止发布，保留 `gh-pages` 历史以便回退；不要修改正式 Windows 安装包。

## 本地操作闭环增强（静态预览）

已添加本地文件准备：文件安全名称校验、去重、剪贴板粘贴、筛选/排序、文本及媒体临时预览、候选传输容量提示，以及可供自测的本地合成文本。仍无文件发送或服务器存储。

UI 回归：`npm run test:browser`（Chromium/Playwright；首次需 `npx playwright install chromium`）。成熟开源流程借鉴与 W1–W4 功能边界参阅 `../../docs/design/WEB-FLOW-CLOSURE-REFERENCE-2026-11-09.md`。
