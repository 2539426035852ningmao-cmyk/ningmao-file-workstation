# Windows × Web 集成核对

本轮保留原#77工作区，独立工作区从#92精确HEAD建立；不改main，不粗暴覆盖任何冲突文件。此表是代码与证据范围审计，不是实机放行证明。

## 实时PR快照

| PR | HEAD | base | 实时Actions |
| --- | --- | --- | --- |
| #77 | f041f36ad94520bfe7a872f02c995988ab643ad2 | feat/capsule-collect-20261108 | Desktop43251466061、Preview43251466071、P343251466167 success |
| #88 | b2c7a1068c386f6ff4d91de6790c98913520fede | #87分支 | Web42611703108 success |
| #89 | 5ae8d4eb2115ca2e0e81fcd0d7788abeb3cca011 | #88分支 | Web42616675271、Desktop42616675230、Preview42616675133 success |
| #90 | 2c70b463e6082715530c1a66222f9d1da69e53a9 | main | Repository43249722877 success |
| #91 | 3f108b98b95555d7ffbf2c64f0c9cc7d7cbcb2ba | #89分支 | Desktop43248619204、Preview43248619031 success |
| #92 | 65ab738a6c84c1f3950651ea8e4ff7035c5f878b | #91分支 | Desktop43249534647、Preview43249534500 success |

六PR均open/未合并。上述绿灯各归属各自SHA，不继承给本轮集成HEAD。#92确实只选择性同步到旧#77的66c7c9d，不能视为完整合并。

## 精简功能矩阵与决定

| 功能 | 已实现代码 | 测试证据 | 真机验证 | 实际缺口 | 动作 |
| --- | --- | --- | --- | --- | --- |
| 文件引用/绑定Copy/SQLite/任务 | 既有Store/Runtime | 原桌面CI，既有原生证据按SHA保留 | 新集成包未验 | 新包数据/任务恢复未验 | 保留 |
| Space/Esc/三主题 | #92 App及现有组件 | 语义Space及界面回归已带入 | #77旧包子集通过 | 新集成主EXE未验 | 保留 |
| Web假在线/重连 | #88 socket-heartbeat/useTransferController | Web单元与浏览器用例 | 非部署实机 | 真实网络断线未验 | 保留 |
| Windows WSS授权关闭/离线通知 | #91 web_device.rs、Inbox/Outbox | Rust及WSS浏览器用例 | 非真实Access | 实际WSS/身份环境未验 | 保留 |
| Web→Windows确认/Store安全保存 | web_transfer_receive/Inbox/PeerLink | 实际Rust安全I/O与合成RTC用例 | 新包未验 | Android/真实授权未验 | 待实机验证 |
| Windows→Web确认/校验/下载 | web_transfer_bridge/Outbox/PeerLink | 实际DataChannel合成字节 | 新包未验 | 保存到手机不等于SHA回执 | 待实机验证 |
| 本机浏览器邀请片段 | #77 TransferPanel片段与上游App解析 | 真实Chromium及URL不带邀请码检查 | 旧query包原生通过 | #92仍用query | 集成 |
| 等待/断线准确提示 | #77准确最长等待文案 | 相关界面与Go晚加入测试 | 原公网有提前失败 | 不能保证固定有效期 | 小修 |
| croc公网试验 | experiments/p3-browser、旧研究报告 | 11月9日78B成功；11月12日公网失败 | 有限Android单向子集 | 非W1–W3，不接作第二正式入口 | 暂缓 |
| 正式公网/Cloudflare部署 | 现有Worker配置与部署门槛 | dry-run只能证构建配置 | 未部署 | 账号、域名、权限及真实跨端验收 | 暂缓 |

## 两个#77新提交的选择

`2ce52083a`：片段邀请和配套测试适合补入；Android旧公网报告只保留为隔离路线历史，绝不充当WebRTC证据。

`f041f36ad`：准确最长等待文案适合补入；安全退出诊断、HTTPS/WSS就绪、150秒晚加入等保留在隔离实验工具。W1–W3已有心跳、超时和离线处理，不重复实现第二套。

TransferPanel只改本机分享的必要行，保留#92 Inbox/Outbox、接收授权、设备状态和64MiB限制。transferBackend/harness/App/lib.rs/web_device.rs/Cargo.toml/Cargo.lock/peer/useTransferController保留#92版本；尤其#92另有排序菜单受控状态修正，不回退到#77旧文件。Store源码在两候选间无差异，不改数据库或真实文件业务。

不整包覆盖MEMORY/ACTIVE/矩阵，不将#77的“唯一候选”旧句覆盖新的集成状态。#90导航保持文档职责，不把其文档PR当应用已合main。

## 验证记录

先跑未修改的#92基线：Web单元29项与Node9项、TypeScript/Vite通过；Web浏览器因缺该Playwright版本的Chromium而BLOCKED，正在补既有测试浏览器。Rust首轮缺正常dist前置构建而未执行测试，补正常前端构建后重跑。桌面全量及后续集成验证按实际结果续记，不伪称运行完成。

新集成Windows原生、MSI/便携和W1真实Access双向仍NOT_RUN。未部署Worker、未申请账号或开放公网、未操作私人素材、未合并/安装/发布。回滚保留#77与#92源提交及旧候选，单独关闭集成PR；不删除用户数据。

## 本轮最终源码验证（提交前）

- 未改源码的#92桌面基线195项PASS3.9m；补丁后集成源码195项PASS3.7m，含RTC双向、拒收、取消、来源失败、WSS离线匹配、三主题和窄窗。
- Rust Web安全12项PASS，覆盖心跳/离线净化/角色、远端地址/本机授权/ticket范围/来源变化、受控接收的SHA/遍历/不覆盖/不完整字节；测试前先补正常前端dist，不修改Rust来规避初始化。
- Web单元29项、Node9项、TypeScript/Vite、15浏览器项PASS22.5s；模拟Access/合成信令和实际DataChannel是自动化边界，不是真实Access账号或跨设备证明。
- 首轮Web浏览器15项因缺Playwright1.65对应Chromium1254而BLOCKED；使用项目既有CLI补测试浏览器后全部通过。安装生成的依赖快照只存本机，不引入新lockfile/流程。
- Worker源码预检及Wrangler原有dry-run PASS；Access配置仍为占位，未部署、未上传用户文件、未改真实账户。命令输出的Total Upload是dry-run包体积，不是已上传证明。
- 仅给现有Web CI增加TransferPanel/webFileRules触发路径，让新集成HEAD能运行自己的Web检查；不新建测试平台。
- 机械核对：Rust/Cargo、apps/web/src/worker、App、transferBackend、harness与#92完全相同；没有覆盖#91/#89/#88。实验原实现仍独立，没有增加正式产品入口。

本候选可提交Draft代码审查，尚不能正式合main；待本提交CI终态、精确Windows构建与实机验收。后续包身份以build-manifest为准，旧#77原生证据只保留为原SHA证据。

## 构建及 CI 终态

Draft PR #93，基于#92分支。应用源码及实际候选：`6d59eb0a5c4e2e1cf9eb5c947b758a50b380ebc6`。后续本节/ACTIVE/MEMORY的文档提交不改变候选源码与包身份。

- 同SHA Desktop [43256362087](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/43256362087)、Preview [43256362083](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/43256362083)、Web [43256361882](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/43256361882)全部SUCCESS。完整等待结束后才补本记录，没有中途推源码取消构建。
- 本地Windows x64 debug EXE/MSI编译及MSI只读检查PASS；420条许可证记录，missing为空，warning一项。未安装MSI。
- EXE SHA256：`dec7eb9022689709fdf8ca7e4580826a5003cd98e6ca9dad4a6098d27505c404`。
- 便携ZIP SHA256：`50468d5b7b06a13e77259e46c97dd36dd49c1248c78c01f75f3a6cc31514ba99`。分发data/webview保持为空，原生测试使用另一个新建隔离目录。包未签名，依赖已有WebView2，仍为预览。
- 许可证未关闭项：react-remove-scroll-bar 2.3.8声明MIT，附有补充MIT上游notice，但npm gitHead在声明的上游仓库不可获取，精确版本源码映射尚未核实；不标记正式发行批准。详情保留于包内license-manifest。
- 本批标准包清除实验组件编译变量，没有捆绑未批准的croc分享组件；其实验入口按既有条件隐藏，不宣称其随此包完成公网验证。

## 本候选 Windows 原生边界

全新隔离数据，实际启动精确EXE；圆球→胶囊→完整空文件架、更多菜单→文件互传接收页、W1说明展开均可见。未选保存目录时“开启接收”禁用；未输入配对码，未申请授权，未开启接收/发现/公网。测试进程未发现TCP或UDP端点；未碰真实用户资料。

Windows输入工具首次无截图几何导致两次点击未执行；补截图状态后成功，没有修改产品代码规避工具限制。后续窗口隐藏后工具不再返回可操作窗口；CloseMainWindow返回true但进程仍驻留托盘，最终仅停止本轮自己启动的隔离进程。正常菜单退出、重启恢复因此PARTIAL，不能声称通过。读取SQLite完整性的本机Python命令未执行成功，原生新库完整性不作通过声明；Rust安全测试与CI结果按各自范围保留。

原生拖入拖出、Space、三主题、DPI/多屏、新包数据恢复、真实Access授权、Android/双Windows双向收发仍NOT_TESTED。界面启动成功、合成DataChannel和CI绿灯均不替代这些验收。

下一项为W1–W3真实部署环境接续及同候选双向传输；真实账号/域名/Access配置目前是明确外部条件，尚未部署。其后复核原生文件回归。当前允许Draft审查，不允许正式合main/安装/发布。回滚保留#92、原#77、旧候选和隔离数据；退出应用后备份data/webview，再换回旧EXE；本轮无schema迁移。
