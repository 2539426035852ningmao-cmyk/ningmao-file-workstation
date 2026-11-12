# 第一批：空发送页减法与隐藏状态查询

基线：#93 / `6ee04ea5f2012e1ce4adbe4997a38276642a8d06`（应用源码与 `6d59eb0a5c4e2e1cf9eb5c947b758a50b380ebc6` 相同）。开工工作树干净，沿用现有工作区建立 `perf/transfer-progressive-idle-20261113`；原集成分支、#77、旧包及用户数据保留。实时确认 #93 base 为 `integration/windows-candidate-web-sync-20261112` / `65ab738a6c84c1f3950651ea8e4ff7035c5f878b`，仍 Draft；基线 Desktop43260464536 / Preview43260465334 / Web43260464571 全 SUCCESS。

## 本批范围与前后对照

| 位置 | 实际问题 | 删除 / 合并 | 保留能力 | 验证 |
| --- | --- | --- | --- | --- |
| 发送页无文件 | 尚不能发送却自动发现附近设备、显示连接信息表单及发送按钮 | 文件选中前不呈现发送配置、预检和本机实验；不调用发现 | 返回选文件后恢复原设备选择/连接/发送；进行中的取消和最近终态保留 | 空态→返回→选 Alpha→发送到设备→选目标→关闭，选择保留；合成调用计数 |
| 网页设备状态 | 已授权后固定4秒轮询，隐藏仍查询；9秒慢请求会重叠 | 两处读取时序收束为可见状态调度，请求结束后再等待4秒 | 打开/恢复可见刷新；授权后持续更新；关闭丢弃过期结果；原收发事件订阅独立保留 | 可控时钟、合成 visibilitychange、9秒延迟 |
| 窄窗证据 | 旧截图可能截到面板滑入中间帧 | 先等完整入屏，再禁止截图动画 | 三主题、方向键切换与原接收页 | 340×320 三主题，完整面板入屏断言 |

原流程：更多→文件互传→发送页（未选文件也出现发现、预检、连接配置和禁用发送）→返回选文件→发送到设备→目标→确认。

新流程：空发送页仅提示返回选文件；已选文件的常用路径保持 **选择文件→发送到设备→目标与发送**。对方接收确认与真实网络专项授权仍独立保留；不虚称所有任务都已缩减到三次点击。没有更换默认发送通道，也没有合并 LAN 与 W1–W3 的权限、数量及终态语义。

## 可复现测量

同机 Ryzen 7 5800H、Node24.18.0、React19.3.1、Vite8.3.5、Playwright1.64.1/项目已有 Chromium，串行1 worker。前后均 `npm run build:test`，同 Harness/合成后端与3个200B TXT引用、2个文件架；测试设备授权仅内存合成对象，未连接 Access 或真实网络。

`tests/browser/transfer-idle.spec.ts` 调用真实 TransferPanel；Harness只在后端边界计数。原实现运行这三项检查全部按预期失败，失败日志和前后截图保留在本机交付证据中。不是复制生产逻辑得到的模拟结果。

| 指标 | 基线 | 修改后 |
| --- | ---: | ---: |
| 未选文件进入发送页的发现调用 | 1 | 0 |
| 空发送页连接 form 的 input/textarea/button 数 | 6 | 0 |
| 已授权、可见40秒的周期状态查询（初次读取后） | 10 | 10 |
| 同一面板隐藏40秒的状态查询 | 10 | 0 |
| 后端单次耗时9秒时的最大并发状态查询 | 3 | 1 |

可见性由测试显式覆盖 document.visibilityState 并派发事件，时钟加速执行40秒；不等同于 Windows 真实托盘计时。打开已授权面板时授权状态首次变化会多读一次，未将其算成周期轮询收益。此批证据仅支持减少无效发现、隐藏查询和慢请求重叠；**没有原生CPU/内存、冷/热启动或滚动提速百分比结论**。原生 WebView2 是否在所有隐藏路径派发可见性变化仍待实测。

原生源码 `transfer_devices` 调用现有 UDP discover，最多等待约2秒。本批只阻止零选择时无效调用；没有实际启动 LAN 发现以估算网络延迟收益。

## 回归与证据边界

定向首轮17 PASS，含连接粘贴、原配对/取消/接收确认、返回后选择保留和三项新检查。全量首轮发现3主题错误色旧用例依赖无选择连接表单，已调整为真实“选文件→发送到设备→输入无效连接”，保持错误对比度及不发送的原断言，不为旧用例恢复冗余产品表单。完整终态、同源码包SHA与原生证据另记同批PR及构建清单，不能拿基线包代替。

最终完整桌面199 PASS（3.8分钟），三主题空态截图已检查；首轮195 PASS/3个旧测试路径FAIL保留。已执行：仓库检查、diff检查、生产及测试TypeScript/Vite构建；Rust Web安全12 PASS；Web29单元+9Node PASS及15浏览器 PASS（23.5秒）。Web业务未改，未部署。原生拖放、DPI/多屏、真实Access、Android/双Windows双向仍保留 NOT_TESTED，不由本次浏览器检查扩大为通过。

## 来源、风险与回滚

仅复用本仓库 Apache-2.0 的 TransferPanel、既有 Radix/shadcn Tabs/Sheet/Button、Harness/Playwright 与浏览器 Page Visibility/setTimeout 原生能力；检查了集成分支及 GitHub 交接中的已有实现，没有引入外部代码、图标、依赖或新许可义务。Figma连接工具可用，但没有指定目标文件，本次局部实现不需要写入设计稿，未创建或猜测文件。Playwright MCP未配置，使用项目已配置CLI回归；原生UI使用 computer-use 既有工具，不能互相冒充。

改动限桌面 TransferPanel 和相关测试/执行记录。Rust、SQLite/schema、文件I/O、窗口生命周期、传输权限、Web/Worker源码均不变。不迁移数据，不安装、部署、合并或正式发布。react-remove-scroll-bar2.3.8精确源码映射既有警告仍未关闭。

代码回滚至 `6ee04ea5f2012e1ce4adbe4997a38276642a8d06` 或回退本批提交；可运行基线仍为6d59eb0旧候选。换包前完整退出并备份 data/webview；不覆盖旧包或删除用户数据。构建清单的sourceCommit标识新包实际源码，不把后续纯文档HEAD写成应用源码身份。

## 精确构建与 Windows 子集

Draft [PR #94](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/94)，base 为 #93 分支。应用源码与实际 EXE 的 sourceCommit：`f81e9def718dc2a784d16c7a7eee87f458865c28`。后续仅测试/记录修正不改变本包身份，不重打 MSI。

- EXE SHA256：`6895e9b918fe9e6495646a9633218c24deb31ac7ece132eb88bf7c0a23b4dda5`。
- 便携 ZIP SHA256：`830e94fed2db88c1be0c44657cdf973eb26f9a9091293125ede83f78ebed9eea`。ZIP 实际解压后9文件逐项校验通过，分发 data/webview 为空。
- Windows x64 debug、未签名、依赖已有 WebView2；EXE/MSI 构建和 MSI只读载荷检查通过，420许可记录/1既有源码映射警告。未安装或正式发行。
- 同包 EXE、新建隔离 data/webview：球→胶囊→420×520完整空架→互传接收页→空发送页→返回架，PASS。空发送页只有选择提示及收起的设备授权，连接/发现/预检表单未出现，开启接收默认禁用。
- 首次 PID42568 与重启 PID40476 均经菜单完整退出，进程实际结束，TCP/UDP归零。重启恢复默认球，Ctrl+Enter可返回完整空架；只读SQLite检查 `integrity_check=ok`，2架/0项/0任务。只证明新隔离空库恢复，不证明历史用户数据迁移。
- 退出均出现已有 WebView2 `Chrome_WidgetWin_0` 注销1412日志，未见进程残留或数据损坏；不宣布该旧日志问题修复。重启后右键曾出现 WebView2 默认菜单，Esc关闭，未操作其菜单项，不扩展为右键产品菜单验收。
- 不含实际LAN发现/传输/Access授权、原生拖放、Space、三主题全状态、DPI/多屏或原生CPU/内存测量。

## CI真实失败与测试同步修正

f81e9de 的 [Web43264403366](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/43264403366)、[Preview43264403271](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/43264403271) SUCCESS。[Desktop43264403485](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/43264403485) 的 Windows安全/编译 SUCCESS，Ubuntu浏览器198 PASS/1 FAIL；失败是原 metadata-sorting.spec.ts 的窄窗键盘检查，三项新增性能检查均通过。没有重跑同一作业掩盖失败。

未改代码本机重复12次得到11 PASS/1 FAIL；临时记录 focusin/keydown/click 后重复16次得到13 PASS/3 FAIL。失败事件明确是排序选项聚焦后回到 menu，Enter实际发给menu，排序偏好仍manual，没有触发排序click。对照已安装Radix Menu源码的pointer-leave会聚焦menu，不把此次未发出的键盘操作误判为本批生产排序回归。

测试修正仅在该键盘段把鼠标移出菜单，再聚焦选项、断言焦点并按Enter。保留排序生效、菜单关闭/回焦、末项可达的全部原断言；删除临时诊断，不增加延迟/超时/重试，不改App或Radix。修正后20次连续PASS（37.6秒），新HEAD完整CI终态见PR最终描述；本地旧失败及原始CI日志保留。
