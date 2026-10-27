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

本次本机取消**确认**10ms；完整取消仍等待上传返回409及临时文件清除，不能把确认耗时当作全部清理耗时。三个受控进程的Windows峰值工作集为6,885,376 / 9,121,792 / 9,220,096字节，包含OS/DLL开销，仅代表该次实验，不是通用预算。完整公开脱敏数据见`evidence.json`；原始失败记录保留在本机，不上传实验私钥、令牌或未脱敏日志。

边界：控制JSON最多64KiB；文件接纳上限512MiB，**实际只验证64MiB**；上传60秒安全截止。仅有同步有界流，慢磁盘背压、控制通道饱和和并行上传未专项压测。不支持跨进程断点续传、设备发现或产品接收UI，不是两台设备/官方LocalSend互通。正式接入前仍须完成接收目录权限/重解析点防御、真实授权/配对、任务中心接入与专项许可。无新增依赖，Cargo.lock未改。

## 复用与边界

- 官方LocalSend core检查于2026-10-27：`cfd699125f2aa4c69f48fd274cf4bb1876a5e08d`，上游Apache-2.0。当前 `start_with_port` 直接绑定IPv4/IPv6 wildcard，不能在本次仅loopback授权下调用；未运行该服务、未复制其源码。
- 根据官方[Protocol v2.2](https://github.com/localsend/protocol)独立实现prepare-upload/upload/cancel最小适配，不声称完整协议兼容。mTLS使用两端独立临时证书、固定信任根；应用层会话和每文件随机令牌，不接受未批准的接收。
- 直接复用rustls/rcgen进行TLS、httparse解析、tempfile防覆盖发布、sha2校验、serde序列化、uuid随机令牌；版本及传递依赖锁定在本目录Cargo.lock。依赖许可证以实际cargo metadata为准，未把Core和Flutter整体移入主工程。
- 原生Windows测试发现accept继承非阻塞状态，已显式切回阻塞以匹配本探针同步TLS；非阻塞只用于带停止标记的accept轮询。

实际证据见 `evidence.json`。真实LAN监听/广播/设备配对/防火墙仍需专项许可。本实验不合入main，不发布，不替代P2关卡。
