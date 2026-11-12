# Android 公网接收：真实联调记录

2026-11-09，PR #77。本记录只放行单个78字节合成TXT的 Windows发送器→临时HTTPS/WSS→Android浏览器接收子集，不放行正式发行、全双向互传或常驻公网服务。

## 实际结果

用户明确批准最长15分钟临时公网联调，十分钟接收，仅合成文件，不改防火墙、不登录账号或启用计费。用户按手机流量测试指引操作，未进行运营商或路由抓包，不能虚构网络测量结果。

运行记录：香港时间20:25:11启动，20:33:33终止，发送器实际退出码0、终态 `verified`。用户Android浏览器截图显示 `All files received and verified`、78 B / 78 B、1/1、100%。初始系统浏览器界面与截图文件名指向Microsoft浏览器，精确版本/Android版本未采集。未独立读取手机系统下载目录或另算其落盘SHA256，因此证据是浏览器接收和协议校验成功，不扩大为全部文件管理行为通过。

来源SHA256 `57bc029ba24925a42cef6f28a94a43f582fc25335feeaab5cf44a416f8fe6c08`，运行前后相同。测试后cloudflared、relay、web、share进程均退出，53318–53323无监听。未访问私人文件，未暴露Tauri、SQLite、本地模型或原生TCP端口；中继及网页源端只绑定loopback，Cloudflare只转发网页和WSS。没有上传手机截图、临时域名、邀请码、口令或原始日志到仓库。

## 固定构建

croc上游固定 `4fc5ac0c8463a3de2b0396205c69a38109863583`，沿原兼容补丁与发送器，不升级依赖或另写传输协议。

| 文件 | SHA256 |
| --- | --- |
| file-scope-entry.patch | `f263cae6af9edc7be6cc02ac4503e792f4327cec9b6083dfaf2884a674df0396` |
| sender/main.go | `1970ca2f33bb4c6c66d7497fd6dee37b2ec93029902f069fadc5d7a75c24ebea` |
| web.exe | `76501391f4a982662fc813e6cc75f149a6f7b7904fb15bc56eb4f73cdb1f3750` |
| share.exe | `233aa2621f5e009f4e4733e7f5911db72646dc2257ca707e8d0674d1cc8ce1cc` |
| relay.exe | `e4480d88a78fdfdfdbe2f73378f0d30ac9c030f4aaaed293027d658cc7a2849e` |
| cloudflared 2026.10.7 Windows amd64 | `2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343` |

Cloudflared官方发布哈希匹配，Cloudflare Inc. Authenticode签名Valid，仅放专用工具目录，无全局安装/PATH改动。[官方发布](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.7)。Quick Tunnel无稳定可用性承诺，不作为正式常驻服务；[官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

组件目录 `D:/Ningmao-Browser-Components-20261109-mobile-window`；stage清单描述原默认回环开发范围，未修改为发行批准。本次公开网关只由专项授权的 `experiments/p3-browser/run-public-proof.ps1 -EnablePublicTunnel` 开启，`distributionApproved=false` 保持。70项许可正文不缺失，但图标、旧通知映射及整体发行审核仍未清关。

## 代码与自动验证

邀请改为 `#receive?code=`，网页支持片段并兼容旧query；新增真实Chromium测试先因旧网页不能解析片段而失败，修复后成功，断言网络HTTP请求URL不含邀请码。原发送器实际下载/来源保护/取消2项PASS8.1s。未改密钥交换或文件协议。

发送等待由过短窗口改为十分钟，UI同步说明，显式取消保持。公网脚本只创建一个全新合成TXT，拒绝覆盖旧目录，按清单校验三组件与官方cloudflared哈希，每次生成随机中继口令，预检Store disabled、已占用端口与真实公网HTTPS健康状态。邀请仅在进程及用户联调链接中使用，不写证据文件。finally清理所有子进程；result.json只含UTC起止、终态和来源SHA256。

最终本地前端构建及全量173界面PASS（3.2分钟），包含此前CI失败的窄窗排序用例；该远端失败仍按其原始SHA保留。仓库检查、PowerShell语法和固定上游补丁反向校验通过。本批源码CI终态另记，不继承旧SHA；未重建含本批改动的Windows主程序，因此不把旧EXE哈希改写为新候选。

这不是正式Windows候选内一键公网分享。当前真实公网试验从专用脚本生成合成文件，桌面链接UI仍走原开发入口。下一步复用这一链路接回现有任务/选择文件入口，并增加手机向Windows反向上传；不另造任务数据库或扫描任意目录。

## 失败与未通过项

- 第一轮用户未找到聊天链接。第二轮120秒后cancelled并关闭，手机20:22访问早已超时，出现1033；符合[Cloudflare对无健康连接器的说明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1033/)，不是已证实的手机协议故障。
- 第三轮内嵌浏览器网页可开但WSS失败；同一网关curl与真实Chromium握手101通过，换系统浏览器后接收成功。内嵌浏览器失败的具体原因未证实，没有放开Origin或跳过安全校验。
- 66c7c9d Desktop CI为172通过/1窄窗排序菜单键盘断言失败，Windows、Preview、P3成功；该排序测试本地通过，原因尚未证实。本批未改无关排序生产实现，也不把它标成远端成功。
- 另一独立Windows、手机反向上传、多文件/大文件、iOS、手机本地落盘SHA256和正式安装升级仍未验。公网稳定域名/账号/常驻服务/计费没有授权或部署。

回滚：关闭专项脚本、保持普通包不附未清关组件；旧2d81216开发包及93d14cc便携包不覆盖。此次不迁移数据库、不修改原文件业务逻辑。后续每次新增公网联调遵守其专项授权时限。
