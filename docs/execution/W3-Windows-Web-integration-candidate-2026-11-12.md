# #77 桌面最新修正 × W1–W3 网页互传兼容集成候选

> 2026-11-12。此分支基于 #91（上游 #89/#88 和 W1/W2/W3）进行**选择性同步**，不是将 #77 六个提交直接 merge 成共同祖先，也没有将应用合入 `main`。

## 为什么要做

GitHub 精确比较 #77 HEAD `66c7c9dd16efb5140f5a00a7bd50a75d68c15e46` 与 #91 候选发现双方历史分叉：新版网页集成分支比 #77 多大量 W1–W3 文件，但 #77 仍有 6 个尚未带入的 Windows 桌面修正。不能只把 #91 功能分支的 `TransferPanel` 整段覆盖最新桌面 UX。

## 本批已同步的代码和测试

| 原 #77 新增能力 | 本次同步 | 不得破坏 |
|---|---|---|
| Windows `App.tsx` 使用 `e.key === " "` 识别用户 Space 预览（不依赖可能缺失的物理 `code`） | 将语义键修复移入 W1–W3 集成基线；移入对应 Playwright 非标准 code/输入框断言 | Esc 关闭、正常打开、输入框不抢焦点 |
| 桌面 `TransferPanel` 本机浏览器分享 | 用一次性分享码生成 `http://127.0.0.1:53323/?code=...`，只在当前本机分享任务活跃时显示链接及复制动作；取消后隐藏 | 保留仅本机标识、64MiB WebRTC 之外的旧 croc 组件入口及用户原始文件 |
| 旧 `browser-share.spec.ts`、`transfer-guidance.spec.ts` | 更新完整链接测试，核验临时参数、取消隐藏链接 | 不误传到 Cloudflare 或自动发布 |
| 隔离 `experiments/p3-browser` 代码/回归 | 保留 #77 禁止 Store/SSH 入口、深链接直接接收、合成来源及下载 SHA 的测试 | 不打开公网上传或自动下载付费组件 |
| 原 P3 开源署名收集器 | 同步 wordlist 归属声明和 #77 研究/许可证清单 | 不把完整清单当作产品发行许可清关 |
| 功能矩阵生成器 | 同步 #77 已验证的 Space 子集描述 | 不把过去的 Windows 原生实测套用到新 W1–W3 EXE |

## 保留的新版功能

#89 Windows → Browser 的原生安全文件来源和逐次确认、#85 Browser → Windows 的受控 Store/jobs 保存、#88 网页心跳修复、#91 Windows WSS pong 超时与 Worker 离线通知、新增受控组件、Windows 原 LAN/TLS 指纹局域网互传和三主题全部保持。没有修改数据库 schema、真实源文件、Rust 本地权限、用户数据或 Cloudflare Access 配置。

## 验收 / 主分支

- 运行本候选 HEAD 的 Windows Desktop CI（浏览器 Playwright、Rust 构建/单测）、Preview MSI 只读检查，以及若触发的 P3 隔离测试。必须如实记录任何失败。
- **#77 的旧原生包实测结果仅归属 #77 精确 SHA**，不能扩大为本集成包原生通过。Windows11 x64、Win10、浏览器真机、双端真实网络、DPI/多屏、用户目录数据保护与安装/便携最终出包另测。
- #77 的 `MEMORY.md` / `ACTIVE-DELIVERY.md` 属历史证据，本分支不覆盖或删改新候选的实时记录；#77 未经选择同步的文档/实验及改动仍须最终 merge 前再逐文件核对。
- #90 是以 main 为 base 的纯导航 PR。本集成分支依旧是 Draft 候选，**不能自动合 main**，也没有通过 W4 公网域名与费用授权。执行正式主线合并必须保留 #77 未包含的 W1–W3 代码，并由最新独立集成分支完成安全、真机与回滚 Gate。
