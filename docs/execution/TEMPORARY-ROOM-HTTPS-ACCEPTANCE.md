# 自托管 HTTPS 临时互传隔离验收

本轮接续 [PR #111](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/111) 的 Windows 本机站点候选。HTTPS 验收使用现有的自托管站点实现和独立的虚拟客户端。测试代码和结果随[草稿 PR #115](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/115)交付。

## 2026-11-25 的测试基线

- Windows 应用候选为 `f2235c6`，EXE SHA-256 为 `af4100844ab50f7aa1061952487ec1101389ebe701e9dbd3a72baf33137cf230`。客体为 Windows 10 LTSC 19044 评估镜像，QEMU 使用软件仿真和独立写入磁盘。该场景使用互传分支 `3a3cae1` 的站点和网页。
- Android 14 使用公开仓库的模拟器。使用 Android 原生证书安装流程，Chrome 验证 HTTPS 证书后，测试覆盖加入审批、双向落盘和供件者休眠。早期运行已通过这些环节，临时锁屏让后续唤醒测试停在系统锁屏。见[首次 HTTPS 实测日志](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/45615713197/job/139210443647)。

## 实测结果

### Windows 虚拟机和网页

网页房主建区，Windows 经 QEMU 的 `10.91.0.0/24` 虚拟 NAT 申请加入。房主浏览器访问宿主回环地址。合成测试 CA 只导入一次性 Windows 客体。宿主浏览器在独立自动化进程中使用本次证书的公钥匹配配置，宿主的系统证书库保持原状。客体的工作站正常验证 HTTPS 证书。

- Windows 上传在第二块连接中断。实际上传偏移依次为 `0`、`4194304`、`4194304`。房间最终只出现一份文件。网页在下载第二块连接中断后重取范围 `bytes=4194304-4194576`，一次点击保存。落盘的 4,194,577 字节文件重读 SHA-256 为 `daa66055a9d885e318dc4aa03d26dcd8b74d994c9eef9112e2ec9a1628bb4ce8`。
- 网页回传同名、不同内容的 4,194,577 字节文件。Windows 首次拒绝，随后在原生确认框接受，保存为 `mixed-fixture (1).txt`。重读 SHA-256 为 `5f47293fce1644c6e4dfded10c67ef48ddaf22b1d427b828112a18ab2e5ad6b8`。预置同名文件和发送源保持原样，客体脚本退出码为 0。
- 第一次从虚拟盘启动时，WebView2 长时间停在空白页。最终复跑将 EXE 复制到客体本地盘，使用已有的隔离 WebView2 配置，并从悬浮入口打开主窗。旧网页脚本依赖两次点击，也在复跑中改成监听一次实际下载。

### Android 14 和断线供件

使用已通过系统验证的 HTTPS 连接完成独立访客审批、双向收发与落盘。模拟 Wi‑Fi、蜂窝、恢复 Wi‑Fi 三种状态均能重新取得同一文件且哈希一致。休眠时供件退出，其他客户端可从站点取得相同内容。唤醒后由用户主动重新开启供件。[修复前的隔离实测](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/45619837712/job/139224719876)

同时关闭 Wi‑Fi 和蜂窝时，网页报断线，而站点仍把旧供件连接列为在线。接着用保持打开的模拟连接复现。修复沿用现有的站点事件流，每 10 秒发出一次供件心跳。只有实际在供件的浏览器才回执。站点超过 30 秒未收到回执，停止向下载端推荐该设备，也停止向它转发供件请求。有有效暂存副本时可继续从站点下载。

供件过期修复的首轮 Android CI 连续通过断网、自动回到原互传区、停站和重启。重启后原邀请仍能看到暂存文件。[带修复的 Android 实测](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/45621220304/job/139229568177)

本机网页单元与站点回归共 43 项通过，其中新增回归覆盖失联、其他成员无法代发心跳和连接恢复。换用新版站点后，之前打开的浏览器页需刷新，并按原流程主动开启供件。

## 复跑

### Windows 虚拟机和网页

1. 准备已安装 WebView2 的 Windows 客体、同一候选的 Windows EXE、独立数据目录和浏览器配置。QEMU 使用用户态 NAT，把客体可达的虚拟宿主地址映射到宿主回环。本站点只在宿主回环监听。
2. 运行 `npm --prefix apps/web run build`。用 `apps/web/tests/room-test-tls.mjs` 的 `createTestTls` 生成一次性测试证书，包含宿主浏览器及客体使用的两个地址。在一次性客体中信任测试 CA。宿主的测试浏览器使用独立自动化配置。将 `ROOM_DATA`、`ROOM_PORT`、`ROOM_TLS_CERT`、`ROOM_TLS_KEY` 和 `ROOM_BULK_QUOTA_BYTES` 指向这次的合成环境，再运行 `node apps/web/selfhost/server.mjs`。默认监听地址为 `127.0.0.1`。
3. 网页建区并打开加入审批。Windows 用客体可达的地址和同一个邀请码申请加入，网页批准后交换两份不同内容的同名合成文件。每个方向用保存得到的文件重新计算 SHA-256。Windows 收件先拒绝一次，再确认保存，检查源文件和目标目录的同名原件。
4. 重试故障可复用[双虚拟机验收](TEMPORARY-ROOM-WINDOWS-GUEST-ACCEPTANCE.md)的第二块中断条件。上传复用同一任务编号，下载重取第二段范围，最终只有一份成功的发送记录。

### Android 14 模拟器

复用公开仓库 Android 工作流的独立模拟器。脚本在临时目录生成证书，并通过 Android 设置把根证书装入一次性模拟器。Chrome 使用常规 HTTPS 验证，通过虚拟网关地址访问宿主回环站点。Wi‑Fi 和蜂窝由模拟器提供。临时锁屏仅用于导入证书。

```sh
npm --prefix apps/web run build
node apps/web/tests/android-room.mjs --https-emulator
```

现有的 `node apps/web/tests/android-room.mjs` 仍可复跑 ADB 回环场景。虚拟宿主地址定义见 [Android Emulator 网络地址说明](https://developer.android.com/studio/run/emulator-networking-address)。

## 场景边界

Windows 客体、Android 模拟器、回环回归和 GitHub 检查分别记录。测试使用合成内容及临时证书。公网可达性、运营商网络、实体手机、群主站点离线自治及长期 NAS 供件需独立验证。
