# 当前交付状态 · 2026-11-04

- 阶段：P2 已验收；P3 地址/指纹配对的收发垂直切片已实现，Windows/Linux 回环 CI 与本机回归通过；等待首次真实 Windows LAN 验收；P4 本地检索、规则建议和可选模型对话已接入。
- 分支/PR：`feat/first-delivery-integration` / #57（Draft）。当前 HEAD `8b4ee5538d6612bc8028ae538502331c1a1b4a1f`；r3 Windows 包的 `build-manifest.json` 锁定同一源码提交。
- P3 范围：明确 IPv4 地址 + SHA256 证书指纹；只监听用户主动选择的私有/回环 IPv4；批次发送 1–16 个已登记普通文件；接收端逐批人工确认；接收目标仅为选定的绑定目录；TLS 指纹校验、内容哈希核验、安全暂存与不覆盖编号；来源始终保留；进度、取消和终态写入现有任务中心；取消时先通知接收端再断开上传流，确保接收任务记录取消终态。
- P3 未完成：官方 LocalSend 客户端互通、设备发现、跨网、手机和两台柠猫的 Windows 原生验证。当前协议路径与格式参考 LocalSend，但尚未证明官方客户端兼容。真实非回环监听/防火墙操作未执行。
- 回滚：P2 `4034d785cfc15f3885427f57a90cf63c07467cb9`、旧候选与旧数据全部保留。此次仍是独立候选，不安装、不合并 main。

## P4 当前能力

- 跨文件架搜索、重复比较和本地规则建议。
- 更多菜单里的 AI 对话抽屉支持兼容 OpenAI API 的端点配置、流式回复、停止、历史、新建/删除、Markdown 与代码复制；Windows DPAPI 加密密钥，只返回是否已配置。
- 可主动测试已保存的模型配置，测试请求可取消且不写聊天历史。此功能不代表任何真实模型已配置或调用；本轮未产生模型请求、费用或模型下载。

## 本轮验证

- `npm run build:test`：通过。测试构建提示 harness 主 chunk 超过 500 KB；生产按需加载聊天与互传组件。
- `npm run test:ui`：123 项通过（Playwright 浏览器合成 Harness，不是 Windows 原生验收），其中互传专项 3 项通过。
- Rust：Loopback 15 项 + Store/任务 13 项通过；涵盖回环 TLS 错指纹拒绝、人工拒收不写入、4 MiB 收发、暂存项不进入绑定文件架、批量/取消/同名保护/来源保留及任务持久化。
- Windows 桌面 Rust 完整 `cargo test --no-default-features`、`cargo check`、Clippy 严格模式和格式检查通过；取消终态双进程测试连续通过 10 次。
- `8b4ee55` GitHub Actions 全通过：P3 Loopback run `41829936134`（Windows + Ubuntu）；Desktop run `41829936175`（Windows 安全测试/构建 + 浏览器）；Preview run `41829936157`（MSI 只读检查、便携包构建/上传）。旧 `26808b2` 出现的 Windows 取消终态偶发失败已由本轮取消顺序修复处理。
- Windows GUI、真实局域网双机、官方 LocalSend 互通、模型 GUI 和真实模型响应：NOT_TESTED。

## 数据、安全和交付

- P3 自动化只使用本机回环地址及合成文件；没有访问私人素材、配置防火墙或启动非回环监听。
- 不创建云端账户、不触发付费 API、不下载模型。TLS 接收端证书为本机临时生成，发送端必须核对显示的 SHA256 指纹。
- 已有 2026-10-30 包保持不变：`D:/Ningmao-Preview-P3-P4-20261030.zip`，SHA256 `4e0f7de031e50465acf98bc79b6c2aeb58d915b92b0617a8c2718905754ab8cb`（源 `7433f29`）。过渡包 `D:/Ningmao-Preview-P3-P4-20261104.zip` 同样保留。
- 最新便携包：`D:/Ningmao-Preview-P3-P4-20261104-r3.zip`，SHA256 `2c8a344db1205b8dc40103023e7b76fc9bb7a37c386dd3fc21145171d5a91b51`。便携 EXE SHA256 `14f5b2bc18cb0309928183f92c0ac74b4473a346674420699f2128301340134c`；MSI SHA256 `a5d54e6f01a261ccb9be37d6e7cac7d8cdb998fd88197ce20c1b482c4b52b267`。源为 `8b4ee55`；预览未签名，MSI 仅只读检查，未安装/启动。
- 许可收集 408 条记录，仍有 1 条既有 `react-remove-scroll-bar@2.3.8` 精确上游版本映射警告；不代表发行许可清关。
- 文件数据库 schema 2 与原有引用/复制逻辑未变更。后端仅把 `.ningmao-receive-*` 暂存项排除于绑定架快照。

## 下一步

1. 当前 `8b4ee55` 三组 GitHub Actions 全绿，r3 候选已可供用户基础体验。
2. P3 证据与候选哈希已更新到 Issue #37 与 Draft PR #57。
3. 首次真实 LAN 监听/双机传输仍需专项许可；此前不配置防火墙、不启用非回环监听。
4. P3 原生验收通过后再核查官方 LocalSend 客户端互通；P4 继续完成本地搜索/轻量 Agent 闭环，不用模拟回复冒充真实模型或默认云端。

GitHub 推送使用已有进程级网络设置，不改变全局代理、PATH 或账号权限；不在仓库记录本机代理详情。
