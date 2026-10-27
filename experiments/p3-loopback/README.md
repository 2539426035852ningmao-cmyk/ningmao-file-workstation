# P3-1 · 隔离加密 loopback 探针

基线为 P2 `8ae8a590c467368178d1eaca0b017544d23d36d1`，不修改桌面应用、数据库或稳定候选。仅监听 `127.0.0.1:0`，不广播、不修改代理/防火墙，不进行真实 LAN 验收。

```powershell
cargo test --locked --manifest-path experiments/p3-loopback/Cargo.toml
cargo run --locked --manifest-path experiments/p3-loopback/Cargo.toml -- probe <新的绝对合成目录>
```

一条命令启动两个受控子进程，检查单文件、批量、SHA256、接收拒绝、冲突编号、恶意路径、会话取消、错误token/重放、证书信任失败、损坏哈希和断线不发布。输出 `sender-result.json`，只有全部断言和子进程成功才为SUCCESS。失败日志留在合成目录；不要上传自动生成的 `keys.json` 或包含令牌的材料。探针只生成临时实验身份，不访问用户账号凭据。

当前采用有界HTTP/1.1请求（每文件至多16MiB），未实现流式背压/进行中取消、设备发现或产品接收UI。取消测试为上传前取消；不是两台设备、官方客户端互通或正式LAN功能。正式接入前必须增加流式写盘、接收目录权限/重解析点防御和真实授权与配对流程。

## 复用与边界

- 官方LocalSend core检查于2026-10-27：`cfd699125f2aa4c69f48fd274cf4bb1876a5e08d`，上游Apache-2.0。当前 `start_with_port` 直接绑定IPv4/IPv6 wildcard，不能在本次仅loopback授权下调用；未运行该服务、未复制其源码。
- 根据官方[Protocol v2.2](https://github.com/localsend/protocol)独立实现prepare-upload/upload/cancel最小适配，不声称完整协议兼容。mTLS使用两端独立临时证书、固定信任根；应用层会话和每文件随机令牌，不接受未批准的接收。
- 直接复用rustls/rcgen进行TLS、httparse解析、tempfile防覆盖发布、sha2校验、serde序列化、uuid随机令牌；版本及传递依赖锁定在本目录Cargo.lock。依赖许可证以实际cargo metadata为准，未把Core和Flutter整体移入主工程。
- 原生Windows测试发现accept继承非阻塞状态，已显式切回阻塞以匹配本探针同步TLS；非阻塞只用于带停止标记的accept轮询。

实际证据见 `evidence.json`。真实LAN监听/广播/设备配对/防火墙仍需专项许可。本实验不合入main，不发布，不替代P2关卡。
