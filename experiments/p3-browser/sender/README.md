# 浏览器分享发送器与任务落库证明

## Runtime 生命周期接线（2026-11-05）

`ShareControl` 每次持有一个发送会话，准备失败或发送器/线程收尾后释放；任务ID由已校验并落库的真实事件登记，不由网页指定。主Runtime已持有该控制器，现有 `cancel_copy` 在Store权限校验后路由分享取消，`clean_quit` 在分享进行时返回明确提示，等待任务完成或用户在任务中心取消后再正常退出。没有改LAN取消行为、数据库schema或文件权限。

隔离example现在直接使用同一控制器：每次真实事件验证重复启动与退出均被阻止，stdin取消查实际Store任务ID后调用 `cancel_job`，成功/取消收尾后验证退出放行、旧ID不再可取消。最终Chromium两项PASS（12.3秒）；实际journal显式重开验证PASS；准备失败释放/错误哈希/退出不能伪造成功等普通测试5通过，journal项在默认运行中明确跳过后单独执行。严格Clippy与主工程无默认特性check通过。测试先因缺少ShareControl编译失败，再实现后通过。测试端口与发送进程残留为0。

Runtime的持有/取消/退出路由已有代码，但主程序尚无启动分享的IPC或按钮，不能声称GUI生命周期已验收。下一步须由可信后端固定组件及连接配置，并从文件架ID解析授权来源，再接可撤销分享信息展示；不得把测试入口的路径/程序/hash环境变量作为前端可选参数。退出策略沿用现有互传的“完成或取消后退出”，不强行杀主程序。当前仍仅回环合成文件测试，r5不覆盖，未安装/发布/合并。

## 受控子进程监督器增量

Rust `browser_share_process.rs` 已接已有任务桥接：校验调用方固定的发送器SHA256，只接收主程序已打开的来源句柄，建立临时副本，再经stdin发送配对配置。控制器只转发已验证的结构化事件；显式取消经stdin送达，5秒仍未停止则结束自己拥有的子进程；异常退出落失败，进程/读取线程收尾后释放临时副本。没有shell命令拼接、运行时凭据参数、任意路径IPC或新增依赖。

`examples/browser_share_supervisor.rs` 是隔离命令行测试入口，不是Tauri命令；测试传入固定构建得到的Go程序与预期哈希，生产监督器必须由可信Rust调用方选择。它真实调用主工程监督器，调用方的SQLite任务表与最终结果一致。

Windows Chromium监督器两项实测PASS（最终14.3秒）：源句柄→副本→真实浏览器下载SHA256一致→协议确认→现有任务；无接收方时显式取消→cancelled。成功/取消事件再次用既有Store重开验证PASS；错误程序哈希拒绝且没有任务PASS；相关Clippy严格/主工程无默认特性check/格式PASS。初次编译有闭包结果类型推断错误，已补显式Result类型后通过；没有隐藏该失败。

复跑：先用cargo构建`experiments/p3-loopback`的`browser_share_supervisor` example，再给 `run-sender-proof.ps1` 原有四参数增加 `-SupervisorBinary <example-executable>`。脚本会从固定源码构建Go发送器并把实际哈希交给测试入口。事件落在专用克隆supervisor-events.jsonl与supervisor-cancel-events.jsonl；安全副本为 evidence/supervised-*.jsonl。监督器测试退出后对应端口和进程均无残留。

这一步仍未把功能接成主程序分享按钮：Runtime中的任务取消路由/正常退出统一收尾、分享信息展示与临时链接还需下一步接入。主程序不能把实验入口接受路径的方式作为前端权限接口。当前只有本机中继，未提供公网服务、手机或双机支持。r5候选不覆盖；本次继续更新原Draft #61。

2026-11-05，依赖 #59 的固定 croc `4fc5ac0` 与 Windows兼容补丁。此阶段是真实发送器+内部Store桥接，不是用户可点击的完整分享功能，未增加IPC、网络权限、数据库迁移或新UI按钮。r5仍在独立#60分支；#60 Desktop/Preview CI已成功。

## 实现

`main.go` 从stdin读取一次有界JSON请求（relay/password/code/paths），入口只接受127.0.0.1中继、1–16个普通文件、每个不超过512MiB；调用上游Go API发文件，不解析终端输出。不开放接收/SSH/Store。日志和stderr被丢弃，stdout仅输出版本、阶段、文件数、总大小；配对码、密码、路径不进入任务事件。

`extension/status.go` 是给固定上游附加的6行状态读取方法，通过已有生命周期锁读取成功标志；发送API返回错误或缺少该标志都不发verified。显式取消stdin命令与60秒截止通过context终止。没有实时字节回调，所以阶段只能叫“等待接收或传输中”，不能伪造百分比。

Rust `browser_share_tasks.rs` 将本机受控发送子进程事件映射到现有Store：queued→copying→completed/failed/cancelled。进程退出不能代替确认事件；终态不可重复覆盖，归属/文件数/大小不一致拒绝写入。该桥接在主工程可编译，当前只由隔离测试调用；后续进程监督器必须固定可执行文件与授权来源，不能把网页或对端JSON直接送入它。

## 实测

- Go实际文件入口单测通过，检查普通中文文件计数、拒绝目录和外部中继。
- Chromium两项实际网络测试通过（11.4秒）：发送170000字节中文合成TXT，浏览器确认前只有queued/waiting；下载后源与目标SHA256一致，发送端协议确认后输出verified；另一项无接收方时显式取消，输出cancelled且退出非零。
- 首轮浏览器测试1通过/1失败：未明确禁用目录选择器，等待download事件超时。按既有下载路径禁用目录选择器后重跑通过；不把保存对话超时当协议成功。
- 实际两份事件journal分别被Rust桥接写入隔离SQLite，逐阶段状态正确；重开后completed/cancelled保留，消息不含配对码。专项“进程退出不能伪装成功或覆盖终态”通过；相关Clippy严格模式通过。
- 主工程 `cargo check --no-default-features`、Rust格式检查、PowerShell解析与仓库基础检查（60必需/585跟踪文件）通过。实际journal专项已显式使用ignored参数运行，不将默认跳过当成通过。
- 全部仅回环/合成文件，端口退出后无监听；无公共中继、私人文件、模型请求或费用。原始trace和stderr不上传。`evidence/*.jsonl`是实际子进程输出，字段不含路径或秘密。

发送器本机构建EXE SHA256：`f17fa2779c16928e90732edd29a87f12450ca17ff78b40bdd7564d86c86792e9`。verified.jsonl SHA256 `d924462c132d2dcfd8211c0d5b7a930ac2a193d0051c67652afeae0840d4c867`；cancelled.jsonl `e2d84b2f9e639867e45e7888a7b034076ce2c6003ad55ebe26c30e64923c16c1`。Go二进制仅本地实验，不进入发行包；上游许可继承父目录记录，完整依赖发行清关仍未完成。

## 复跑与下一关

在父目录已说明的工具/固定源码环境中运行 `run-sender-proof.ps1`，四个目录参数与 `run-proof.ps1` 相同；脚本自动准备上游、复制发送器/状态扩展/浏览器测试、构建并执行实际链路。需要专用克隆，原始上游tracked修改仅保留原Windows补丁，新发送器和测试以untracked添加，不推送上游。

Rust再执行 `cargo test --manifest-path experiments/p3-loopback/Cargo.toml --test browser_share` 验证常规规则。实际journal项显式ignored，不在缺少浏览器实验时冒充通过；设置 `NINGMAO_BROWSER_EVENTS` 指向专用克隆的sender-events.jsonl，`NINGMAO_BROWSER_CANCEL_EVENTS`指向sender-cancel-events.jsonl，再使用 `-- --ignored --exact real_browser_verified_events_persist_in_existing_store` 单独运行。

下一关是主程序持有授权文件的进程监督器与临时分享入口：文件来源权限/执行文件固定/退出收尾、可撤销链接与现有任务中心显示。该关通过前不增加可用按钮，不让浏览器获得任意磁盘路径。不把本阶段任务落库证明扩大为实时UI接入、公开HTTPS、跨网、手机、反向接收或同名保护。回滚：不合入该内部模块/实验PR，r5和原数据不变。
# 原生接收链接回归（2026-11-09）

`native-receive.spec.ts` 使用进程环境 `NINGMAO_NATIVE_RECEIVE_URL` 和 `NINGMAO_NATIVE_SOURCE`。前者来自正在运行的隔离 Windows 候选界面，只在内存传递，不写 code 文件、日志或提交；后者只允许合成来源。测试直接访问链接，无需点击接收/手填代码，核对下载字节及来源未变。用无 webServer 的临时 Playwright 配置连接已运行的本机53323服务；不启动外部监听。结果不能扩大为手机/双设备验收。
