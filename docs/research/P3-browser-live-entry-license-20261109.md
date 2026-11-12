# 浏览器分享：入口裁剪与词表署名补齐

日期：2026-11-09。沿用 #77；Windows 桌面应用未改动，仍以 `93d14ccb3b45e6903e4aefad84f03a69c7558aea` 包为实际原生证据。浏览器入口补丁提交 `3be91a95e7c6f15781d78653c21ede7e0e3db957`；许可采集器随后仅增加词表 README 收集，不改传输实现。

入口补丁提交的 [Desktop 42547714692](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42547714692)、[Preview 42547714754](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42547714754)、[P3 回环 42547714740](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/42547714740) 全部 success，终态后才提交后续署名批，没有取消运行中构建。这些桌面 CI 不会自动执行 croc 实验，后者以上述本机固定构建/真实回环单独证明。

## 固定源码与最小变更

继续复用 croc `4fc5ac0c8463a3de2b0396205c69a38109863583`、现有 Windows 兼容补丁和发送器，不更新上游或依赖。`file-scope-entry.patch` SHA256 为 `898743b9d0a7c6b3e045165ae237ac84dcd2be298fbf81426b4d3b9949a13a37`。

文件分享构建不再显示 Store 按钮，即使上游服务声明启用；`#store` 及带参数深链接回到首页。既有 SSH 深链接回退保持，Send/Receive 保留。不移除底层 SSH/WASM/Store 代码，不把 UI 裁剪当作端点关闭或许可清关。主程序原先不传 `--store-dir` 的限制保持不变。

新增真实组件测试首先因 Store 按钮仍存在而失败，修复后组件与词表共 5 项通过，TypeScript 和完整补丁反向检查通过。没有手改 dist 或旧生成清单。

## 新组件与回环证据

新目录 `D:/Ningmao-Browser-Components-20261109-live-only`，旧 20261106 暂存目录保留。使用原 stage/run-sender-proof 流程，Go 1.27.3 和已有缓存，`GOPROXY=off`，未下载依赖。原始日志仅本机保留，不上传邀请码或私人路径。

| 产物 | SHA256 |
| --- | --- |
| web.exe | `1d758565f383109900c163ecb3282cd64b103f549e9b11fdc9444a5958c1fd9c` |
| relay.exe | `e4480d88a78fdfdfdbe2f73378f0d30ac9c030f4aaaed293027d658cc7a2849e` |
| share.exe | `f17fa2779c16928e90732edd29a87f12450ca17ff78b40bdd7564d86c86792e9` |
| THIRD_PARTY_NOTICES.txt | `fb729474d2b76b9b8dc71cd6a314bf9661d880e3f1f310b203764a08b782b700` |

真实 headless Chromium + Go 发送器两项回环 **PASS，11.3 秒**：中文合成文件下载 SHA256 与来源一致，发送器只在浏览器核验后报告 verified；无接收器时取消进入 cancelled 终态。测试使用的 web EXE 与暂存 web.exe 哈希完全相同。测试后 11823–11828 无监听。此为 Windows 本机回环，不是桌面新 EXE、双设备、手机或公网验收。测试栈保留其上游 Store 服务夹具，不能把它的启动参数冒称主程序参数。

构建仍有大于 500 kB 的 chunk 提示；本批不为该提示改造前端架构。

## 许可结果与剩余门槛

新清单由采集脚本生成：[license-inventory-20261109.json](P3-browser-components-license-inventory-20261109.json)，70 项、missing=[]。EFF 词表原清单只含 CC BY 4.0 正文；现同时保留原 README 的 Electronic Frontier Foundation 署名、原始 URL、原文件/修改后哈希及“移除骰子编号、词序未改”的说明。README SHA256 `06267b8687488adbf82ce4e8329e0fb41547a4bb9e3fb2a0b51b68565b8721e4`。实际生成 notices 已检查同时含来源与修改说明。

实际字体包 `@fontsource-variable/jetbrains-mono` 为 5.3.0，`LICENSE` 包含 JetBrains 作者署名及 SIL OFL 1.1，已被收集；其 SHA256 `403581b69dac5cff4079205e01c6b467e56af449ecbd7247693ddb1baafa005b`。无须另找 OFL.txt 或下载字体。

尚未清关：图片/图标来源授权、旧 Tailcat/gVisor NOTICE 与实际版本的映射、底层 SSH/WASM/Store 表面范围及整体发行审核。`distributionApproved=false` 保持，标准桌面便携包继续不带这些开发组件，不宣称浏览器分享已随标准包正式交付。

版本差异已确认：根 NOTICE 写 `tailscale.com v1.104.1`、gVisor `v0.0.0-20260224225140-573d5e7127a8`，实际清单为 `tailscale.com v1.104.4`、gVisor `v0.0.0-20260926034703-66ed76bcb72f`。内嵌 Tailcat 的 UPSTREAM 则明确固定 `c04c5afee401df40e620db8ae108e957ae07bcd9`，不能用 croc 提交替代其原始来源提交。原始通知不改写；实际模块许可与旧通知一并保留，剩余归属审查不因这张版本对照而自动通过。

回滚：停止当前分享后换回旧组件及对应固定哈希配置；不覆盖旧包或数据库。没有安装、发布、合并、付费/模型调用、LAN 发现或公网开放。下一步只处理上述具体发行门槛，再沿原组件随包流程验证。
