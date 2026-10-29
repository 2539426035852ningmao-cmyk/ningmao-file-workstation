# 当前交付状态 · 2026-10-30

- 阶段：M2/P3互传与P4轻量对话集成；跨网、手机互传继续保留在首版目标中。
- 分支/PR：`feat/first-delivery-integration` / #57。可运行源码：`7433f29c2d7eaaead0670526060c5032015a1397`；后续纯文档提交不改变包身份。
- 回滚：P2 `4034d785cfc15f3885427f57a90cf63c07467cb9`、原候选和原数据全部保留。用户反馈上一轮候选验收通过，不据此补写新版本或双机测试。

## 已完成功能

- P3实现 `3e538101f8f7f52783dbb6f739a0a38fa60a6ad6`：1–16个已打开普通文件批量发送、逐文件/总进度、主动取消及逐项结果，复用Store。仍限localhost；产品设备入口、真实LAN/发现/配对尚未实现。
- P4：跨架搜索、重复比较、本地规则建议；更多菜单的AI对话抽屉已接Rust请求，支持配置兼容服务、流式文字、停止、历史、新建/删除、Markdown/代码复制。后端 `ab612e470b8f63b640d46253b87be0fc7900dd69`。
- 密钥Windows DPAPI加密，接口不返回Key，切换服务地址不沿用旧Key。只增加独立chat表，文件schema2不变。远程HTTPS或显式loopback HTTP，无代理/重定向；最多21条/64KB上下文、100轮、单活动回复、120秒/2MiB回复限制。
- 已生成EXE、MSI及独立data/webview便携ZIP，未安装、发布或合并main。

## 验证

- 前端119项全量回归通过；新增IPC参数测试后聊天4项通过。均为受控浏览器Harness。
- 合并后P3 16库+15 Store测试通过：真实localhost mTLS双文件、第二文件中取消、来源/旧目标保留。
- 合并后聊天4项真实实现测试通过：受控HTTP/SSE三轮、停止/失败、历史重开、DPAPI。未调用真实模型。
- 桌面其他98项通过、5项受控ignored；3项回收测试曾因假定旧目录深度失败，修正为仓库根后3项通过。全targets Clippy、仓库检查通过。
- CI旧运行40935178842因Store子模块路径失败，已修复并补实验Windows依赖。7433f29对应Desktop 40939425620、Preview 40939425493、P3 40939425517，采集时仍运行中/等待，不记PASS。
- Windows聊天GUI、真实模型三轮、真实LAN双向、跨网、手机：NOT_TESTED。包核验不代替实机验收。

## 交付

- 启动：`D:/Ningmao-Preview-P3-P4-20261030/Start-Ningmao.cmd`。
- ZIP：`D:/Ningmao-Preview-P3-P4-20261030.zip`，SHA256 `4e0f7de031e50465acf98bc79b6c2aeb58d915b92b0617a8c2718905754ab8cb`。
- EXE SHA256 `0c6ef577a941a107ad46770f76a442034a7163e72e97cd443f029ad0bb289a55`。
- MSI SHA256 `24d79e57bc2431745a0f10be31f7aa6fb0ed64829467e5db80a054b1de58de75`。只读核验通过，未安装。
- 398条依赖许可记录，保留既有react-remove-scroll-bar来源映射警示，未宣称发行清关。assistant-ui 0.15.32仅评估未复制；现有Sheet配合react-markdown 10.1.0（MIT），锁文件固定完整性，聊天按需加载约124KB/gzip38KB。
- 完整退出后备份data/webview；不要覆盖原用户库。

## 下一项

1. 核对上述CI终态，失败按日志修复。本机 `CARGO_BUILD_JOBS=2` 避免高并发链接占用。
2. 核验Windows聊天实际操作；真实模型由用户在界面自行配置，不索取聊天中的Key。
3. 完成P3设备/接收确认及桌面发送入口，首次LAN/防火墙仍按专项授权；随后croc跨网、手机互通。

Git直连反复失败；核对现有系统代理后，单次进程采用该现有代理推送成功，未修改全局配置。代理端口和私人配置不记录到公开文档。
