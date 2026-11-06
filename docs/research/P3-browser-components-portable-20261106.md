# 浏览器分享组件随包定位与 Windows 原生复测

日期：2026-11-06。PR #68，基于 #62 `ffb8bc8ea8568544e28ec5e0103c6f064b15a4e9`；功能源码 `710a4299edef838dc6725edd7213577e853156d2`。不包含 #66 的形变探针。

## 本轮实际改动

编译期配置可使用相对主 EXE 的 `components/relay.exe`、`components/web.exe`、`components/share.exe`。启动前仍检查固定 SHA256；前端及运行时环境不能替换程序配置，release 不启用此开发入口。此前绝对开发路径仍兼容。

复用原 Go 构建流程，新增 `scripts/stage-browser-components.ps1` 与 `scripts/collect-browser-licenses.mjs`。暂存目录必须是新目录，不覆盖旧候选。上游 croc 固定 `4fc5ac0c8463a3de2b0396205c69a38109863583`，已有兼容补丁与发送器沿用 `experiments/p3-browser`；没有重写协议或引入新依赖。

实测发现旧启动参数 `--store-dir` 会开启上游寄存服务。真实 HTTP `/config.js` 回归首先得到 `store.enabled=true`，移除该参数及不再使用的临时目录后为 false。生产与测试共用启动函数，未复制另一套业务实现到测试。

## 构建身份

| 产物 | SHA256 |
| --- | --- |
| 隔离 Windows EXE | `9813eb88f69c8e3a927c60fb3b205f548d4f8b5250c488396fbea02222a9adee` |
| relay.exe | `e4480d88a78fdfdfdbe2f73378f0d30ac9c030f4aaaed293027d658cc7a2849e` |
| web.exe | `394a8707fca178085dc35d9d29bcfe2b02098aeade6eed5ea0a78aef4b1ec7ff` |
| share.exe | `f17fa2779c16928e90732edd29a87f12450ca17ff78b40bdd7564d86c86792e9` |
| 合并的第三方许可文本 | `e11dae245bda1543a5ba8feed22e6b6bbad6c090a6ac2060b10384321fca9ab4` |

这是一份未签名、仅本机回环的工程验证构建，不是正式便携发行。r7 EXE/ZIP 与用户数据均未覆盖。组件暂存记录 `distributionApproved=false`。

## 已执行验证

| 验收行为 | 结果及边界 |
| --- | --- |
| 组件目录整体搬迁后定位 | PASS：真实临时目录搬迁，按 EXE 解析相对路径 |
| 错误组件 SHA 拒绝、实际 relay/web 启停 | PASS：同一生产启动函数；六端口退出释放 |
| 寄存功能关闭 | PASS：真实 HTTP 读取 `store.enabled=false`；修复前测试明确失败 |
| Windows 原生系统文件选择→引用→选中→发送到设备→创建分享 | PASS：新隔离 data/webview、含空格目录，启动 cwd 与 EXE 目录不同 |
| 真 Chromium 接收该原生邀请并下载 | PASS：`native-receive.spec.ts` 1 项，19.0 秒；下载 SHA 和精确正文一致 |
| 原生完成反馈 | PASS：显示“对方已确认内容校验”，真实 jobs 表为 completed |
| 第二次创建→原生停止 | PASS：显示“已停止，来源保留”，真实 jobs 表为 cancelled |
| 正常退出→同 EXE 重启 | PASS：恢复 1 项引用，completed/cancelled 各 1；SQLite integrity_check=ok |
| 来源保护、最终清理 | PASS：合成源 SHA 未变；测试 EXE/组件进程退出，53318–53323 无监听 |
| Clippy、正常前端构建、配置后的 Windows 构建 | PASS |
| 真双 Windows、LAN/公网、手机、真实 AI | NOT_TESTED，本轮不扩大为这些验收 |

合成源 SHA256：`b366999a800f3adf029b989603dee6dd3ca8ba89670a1d0643d5a3ac94fb889d`。不上传邀请码、真实数据目录、数据库、原始日志或含桌面背景的截图。脱敏机器结果见 [portable-native.json](browser-share-evidence/portable-native.json)。

失败过程保留：相对路径新增测试先因解析函数未实现而编译失败；HTTP测试最初缺少测试进程的 rustls provider 初始化，补齐后才暴露真正的寄存开关失败。原生文件选择器 UIA 索引失效，重新观察后使用现有电脑工具截图定位，未增加绕过应用权限的调试入口。

## CI 与外部测试衔接

功能提交 710a429 的 [Desktop](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42214847459)、[Preview](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42214847492)、[P3 loopback](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42214847598) 全部 success。

复用现有 Windows/Ubuntu 回环 CI，仅增加摘要和 `sender-result.json` artifact（保留 7 天）；两平台结果记录/上传步骤均实际成功。每个 job 是单 Runner 内双进程，不是两台独立 Windows，更不是 LAN 互通证明。后续文档提交需检查其自己的 CI，不能继承这些 run 的身份。

## 许可与未完成项

[自动生成清单](P3-browser-components-license-inventory-20261106.json) 包含 70 个实际 Go/native/WASM、非 dev npm、内嵌源码与 Go runtime 条目，missing=[]。清单由脚本生成，不手动修改。

清单完整不等于发行清关：上游还嵌入 SSH UI/WASM 和 Store UI；本轮只关闭实际寄存服务，尚未裁剪页面及所有无关端点。字体、EFF 词表、图标/图片的源资产署名还需逐项核对；上游根 NOTICE 中部分 Tailcat/gVisor 版本落后于实际模块图，必须以精确版本清单补齐。不得因此把完整上游 web 当成可公开开放的柠猫分享服务。

下一步先从上游源文件收束非文件分享入口及署名，再重新构建、运行实际浏览器兼容回归；不能手改 dist。主线可并行准备现有 ChatPanel/chatBackend/Rust chat 的薄 Provider 接入，但不启用账号、模型下载或付费请求。

## 回滚

### 后续裁剪定位（只读核查）

已核对固定上游源码：`web/src/App.tsx` 通过 lazy import 加载 `SSHPanel`，任务入口位于 `web/src/TaskLauncher.tsx`；仅隐藏入口不足以移除产物。`web/package.json` 的 build 会先调用 `scripts/build-wasm.mjs`，embed 再由 `scripts/embed-dist.mjs` 将 dist 复制进 Go 内嵌资源。因此后续必须在源文件和构建入口同时限定文件分享范围，并重新生成嵌入资源，不能手改 dist 或宣称隐藏按钮就是安全裁剪。

`src/webcli/webcli.go` 明确仅在非空 store-dir 时创建 StoreService；当前移除参数的修复与该实际条件一致。剩余任务是核对路由注册及静态资产，保留直接文件发送/接收及原有许可，不整体重写协议。上游现有本机兼容补丁、发送器和成功记录均未改动。

保持独立分支及 Draft PR。撤回 #68 的应用/脚本变更即可返回基线 ffb8bc8，无数据库迁移。正常完整退出后再备份独立 data/webview；旧 r7 保留原目录及哈希，不跨版本覆盖真实用户数据库。没有安装 MSI、发布、自动合并、修改防火墙或开启公开服务。
