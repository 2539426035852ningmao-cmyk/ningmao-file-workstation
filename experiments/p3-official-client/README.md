# 官方 LocalSend 客户端自动验收（仅本机）

复用 LocalSend Rust core 的官方 V2 客户端，不复制上游实现，不运行官方服务端。
上游：https://github.com/localsend/localsend ，固定提交 `cfd699125f2aa4c69f48fd274cf4bb1876a5e08d`；Apache-2.0，未修改上游源码。
只启用 http feature；实验锁文件与桌面工程独立，不加入发行依赖。

先使用现有 Rust 环境构建 `experiments/p3-loopback`。准备上述提交的官方源码检出（无需初始化 Flutter 子模块），然后运行：

```powershell
./experiments/p3-official-client/run.ps1 -UpstreamRoot <官方源码目录> -ProbeExe <已构建的探针绝对路径> -BuildRoot <新建隔离构建目录>
```

脚本将模板生成到新目录，使用锁文件构建。`CARGO_TARGET_DIR` 可复用现有缓存。
不自动下载上游仓库、不修改网络、账户或防火墙。仅向 127.0.0.1 发送新生成的 393216 字节数据。
临时测试证书只保存在自建临时目录，测试结束后清理，不上传密钥或日志。

实际断言：同名旧目标保留、已知长度内存与真实文件流内容一致、来源保留、取消需观察接收端 cancelled 终态、被拒绝的未知长度流不发布文件。
Windows 本机运行通过；官方 core 有 8 条原有编译 warning，未改上游。

限制：未知长度 FileContent::Stream 对当前实验接收器仍 HTTP 400；官方 cancel 对无效 session 返回 Ok，不能把该值当成功证据。不是桌面产品接入、官方双端或真实 LAN 验收。P2 原生剩余关卡不因此放行。回滚只需停用此独立实验，原桌面与用户数据未改变。