# P3-1 · 隔离加密 loopback 探针

基线为 P2 `8ae8a590c467368178d1eaca0b017544d23d36d1`，不修改桌面应用、数据库或稳定候选。仅监听 `127.0.0.1:0`，不广播、不修改代理/防火墙，不进行真实 LAN 验收。

```powershell
cargo test --locked --manifest-path experiments/p3-loopback/Cargo.toml
cargo run --locked --manifest-path experiments/p3-loopback/Cargo.toml -- probe <新的绝对合成目录>
```

一条命令启动两个受控子进程，检查单文件、批量、SHA256、接收拒绝、冲突编号、恶意路径、会话取消、错误token/重放、证书信任失败、损坏哈希和断线不发布。输出 `sender-result.json`，只有全部断言和子进程成功才为SUCCESS。失败日志留在合成目录；不要上传自动生成的 `keys.json` 或包含令牌的材料。探针只生成临时实验身份，不访问用户账号凭据。

## 流式与传输中取消增量

接收和发送均用64KiB分块，不再把上传正文整体存入Vec。接收端边写同目录临时文件边计算SHA256，长度/哈希通过后才防覆盖发布。会话锁只保护授权与最终发布，不持锁做正文读盘/网络等待；最多4个连接worker，取消可由另一TLS连接处理。取消确认与最终发布在同一锁内排序，确认未完成的文件不会在确认后发布。客户端使用标准`Expect: 100-continue`，先验证会话和令牌，再读取/发送正文，避免早拒绝与正文发送的连接重置竞态。

Windows真实双进程已验证64MiB完整传输及后续新会话：同SHA256、来源保留、既有文件不覆盖；传到临时文件后暂停，再经独立连接取消；传输中断线；残缺文件不发布，临时文件最终清除，后续会话继续成功。已有小文件/批量/证书/路径/令牌/哈希回归同时执行。4个单测、fmt、Clippy通过。

## 接收目录身份与句柄边界

逐级打开接收路径，拒绝已有目录链接/重解析点、相对路径及`..`；Windows额外拒绝UNC/设备路径和远程映射卷。目录身份从选定开始保持到发布与清理结束，不从上传参数接收新的落盘目录。实际目录权限由系统检查，无法打开或创建时安全失败，不提权。

Windows复用既有Safe Copy的无删除共享目录句柄，固定各级目录；使用cap-std的相对句柄create-new建立临时文件，创建成功后才发100 Continue。暂存文件禁止其他写入/删除共享。发布使用普通`NtSetInformationFile(FileRenameInformation)`，文件和RootDirectory均为已捕获句柄，ReplaceIfExists为false；取消/失败通过文件句柄的FileDispositionInfo清理，不拼接可变路径做删除。没有使用任何BypassAccessCheck类、修改账户权限或安全策略。

Linux以rustix openat+DIRECTORY+NOFOLLOW逐级获取目录，IO锚定自有`/proc/self/fd`描述符；发布前复核原路径绑定，替换则拒绝。暂存对象持有自己的目录描述符，保证上层guard释放后仍能清理；缺少/proc时失败关闭，无不安全回退。

新增5项目录/生命周期回归与原4项合计9项，本机Windows通过：叶目录junction与祖先junction拒绝、父/叶改名在句柄持有期间受阻、句柄释放后能改名、异目录暂存拒绝、旧硬链接内容保留并编号新副本、暂存对象独立清理。原探针的junction越界用例首先实际失败，修复后通过；过严共享锁及Win32相对重命名的失败尝试也保留说明。原生64MiB双进程/哈希/来源/同名/中途取消/断线清理/后续任务整套再次通过，最终EXE哈希见evidence.json。

本轮目录guard构建（加本地卷类型策略之前）的三个实验进程峰值工作集为6,938,624 / 9,150,464 / 9,371,648字节，EXE4,364,288字节；该测量二进制ea45f973…已保留，不冒充最终HEAD的内存预算。最终本机取消**确认**约10ms；完整清理仍另等上传409及暂存消失。旧构建f6b4c57的测量保持历史记录，不与新源码混用。

边界：控制JSON最多64KiB；文件接纳上限512MiB，**实际只验证64MiB**；上传60秒安全截止。慢磁盘背压、控制通道饱和、并行上传、实际用户ACL拒绝、FAT/ReFS、异常进程/断电清理与Win10仍未专项验收。没有断点续传、设备发现、产品接收UI或任务中心接入，不是两台设备/官方LocalSend互通。真实LAN仍需专项许可，不把目录子集通过当成P3整体安全清关。

## 复用与边界

- 官方LocalSend core检查于2026-10-27：`cfd699125f2aa4c69f48fd274cf4bb1876a5e08d`，上游Apache-2.0。当前 `start_with_port` 直接绑定IPv4/IPv6 wildcard，不能在本次仅loopback授权下调用；未运行该服务、未复制其源码。
- 根据官方[Protocol v2.2](https://github.com/localsend/protocol)独立实现prepare-upload/upload/cancel最小适配，不声称完整协议兼容。mTLS使用两端独立临时证书、固定信任根；应用层会话和每文件随机令牌，不接受未批准的接收。
- 直接复用rustls/rcgen进行TLS、httparse解析、tempfile防覆盖发布、sha2校验、serde序列化、uuid随机令牌；版本及传递依赖锁定在本目录Cargo.lock。依赖许可证以实际cargo metadata为准，未把Core和Flutter整体移入主工程。
- 原生Windows测试发现accept继承非阻塞状态，已显式切回阻塞以匹配本探针同步TLS；非阻塞只用于带停止标记的accept轮询。

实际证据见 `evidence.json`。真实LAN监听/广播/设备配对/防火墙仍需专项许可。本实验不合入main，不发布，不替代P2关卡。

### 本轮新增复用与许可

- Windows仅用cap-std `4.0.3`作句柄相对创建，源码版本`b7acf8e8807fe3fab991884d2208b7e03d35a409`（crate .cargo_vcs_info），来源[上游](https://github.com/bytecodealliance/cap-std)。未复制其实现代码。源码审阅发现其Windows hard_link/rename/remove_file仍组合路径，因此本实验没有调用这些操作，发布/清理采用原生句柄接口。
- 已查[旧Windows设备名安全公告](https://github.com/bytecodealliance/cap-std/security/advisories/GHSA-hxf5-99xg-86hw)，公告修复线3.4.1；锁定4.0.3，且本项目继续独立拒绝保留设备名/超标数字等，不能把依赖版本当作整体验收。
- 普通句柄相对重命名依据[Microsoft FILE_RENAME_INFO](https://learn.microsoft.com/windows/win32/api/winbase/ns-winbase-file_rename_info)及[NtSetInformationFile](https://learn.microsoft.com/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile)，实际Win32接口兼容性失败已记录，最终NT接口经本机测试。
- `windows-sys 0.61.2`与`rustix 1.1.6`原已在锁文件中，本轮显式声明所需target API。增加cap-std家族11个锁定包，许可证metadata与包内授权文本已核对：Apache-2.0/MIT可选；winx为Apache-2.0 WITH LLVM-exception，须保留其例外文本。不是商业限制许可，不新增收费服务；后续发行仍须生成完整NOTICE。当前仅实验源码及本机二进制，不作正式发行许可清关声明。
