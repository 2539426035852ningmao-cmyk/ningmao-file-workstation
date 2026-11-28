# D14 素材加载与缓存

D14 是基于 D13 的 Windows 便携测试候选。应用构建提交为 `c625a23baa08684679b1b2670618547051f9d82b`。开发记录见 [PR #103](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/pull/103)。

## 调查

1. 社交反馈。一位用户报告机械硬盘打开视频目录会明显等待，关闭缩略图后依旧出现。此例提示还要区分目录读取、磁盘连接和媒体解码。 [Windows 目录加载用户讨论](https://www.reddit.com/r/techsupport/comments/1s2gvi0/why_is_my_hdd_painfully_slow_when_i_open_a_folder/)
2. 社区。darktable 用户在 2025 年 1 月讨论了浏览时预取，另有用户讨论重启后复用缩略图。Audacity 用户报告了打开波形时的播放等待。这些讨论提示需要分别验证显示、缓存和播放。 [预取讨论](https://discuss.pixls.us/t/darktable-culling-implement-prefetch/47593) · [跨会话缩略图](https://discuss.pixls.us/t/how-can-i-keep-the-thumbnails-from-session-to-session/36743) · [Audacity 讨论](https://forum.audacityteam.org/t/hesitation-when-i-hit-play-solved/54235)
3. GitHub。WaveSurfer 支持加载预计算波形峰值，BBC audiowaveform 将波形摘要保存为独立数据，Coil 展示了复用缓存小图作为大图占位的方式。柠猫沿用现有波形解码、IndexedDB 和文件架组件，未引入依赖或复制第三方源码。 [WaveSurfer](https://github.com/katspaugh/wavesurfer.js#faq) · [BBC audiowaveform](https://github.com/bbc/audiowaveform) · [Coil](https://github.com/coil-kt/coil/blob/main/docs/recipes.md#using-a-memory-cache-key-as-a-placeholder)
4. 官方文档。darktable 将尺寸不同的缩略图分级保存，Windows 缩略图接口支持单独查询缓存。柠猫按自身磁盘预算限制记录数量，由本机测试核验重启复用。 [darktable 缩略图](https://docs.darktable.org/usermanual/development/en/lighttable/digital-asset-management/thumbnails/) · [Windows IThumbnailCache](https://learn.microsoft.com/en-us/windows/win32/api/thumbcache/nf-thumbcache-ithumbnailcache-getthumbnail)

## 决定

- D13 的波形只在进程内复用，重新启动会再次解码。D14 每个 WebView 配置最多持久化 512 条波形摘要，每条最多 256 个峰值。源文件标识、路径、字节数和精细修改时间共同形成散列键。文件变化后生成新摘要。波形缓存只含摘要、音频时长和索引。
- 缩略图队列和波形队列各自限制为一个生成任务。波形优先处理主动打开的预览，再处理选中、可见的精选和其他可见文件。主动预览可以排在尚未启动的任务前，已经运行的解码会先结束。播放和波形使用独立路径。
- 图片空闲时只为下一行预取小图。图片预览有缓存小图时在固定区域先显示轻微虚化的缩略图，清晰图解码完再替换。超过预算的缩略图由后端尝试重新编码以便缓存。缩略图缓存保留 D13 的 96 项和单项 160 KiB 预算。

## 验证

- 本机浏览器全部 226 项通过。新增用例覆盖重开缓存命中、精细修改时间变化后的单文件重算、预览优先、千项音频跨区滚动和小图到清晰图的预览尺寸稳定性。
- Windows 便携包在隔离的合成工作区加载六个 WAV 后退出。独占锁住六个源文件并确认读取被拒，再重启同一个包，六条波形都能恢复。解除锁定后试听进度正常推进，八份合成源文件哈希保持一致。MSI 完成只读结构检查。
- 应用构建提交的 GitHub 仓库检查、便携包检查、P3 回环、桌面浏览器和 Windows 检查通过。桌面首轮有一项搜索框焦点断言失败，同一提交重跑通过。本机两项搜索入口用例各重复八次通过。 [桌面检查](https://github.com/2539426035852ningmao-cmyk/ningmao-file-workstation/actions/runs/44281914556)
- 千项测试验证了媒体加载范围，Windows 合成测试验证了跨进程缓存。它们不包含对真实素材库冷启动、跨盘访问或整架元数据扫描耗时的测速。

| 交付文件 | SHA-256 |
| --- | --- |
| `Ningmao-D14-c625a23.zip` | `a9a5345a386226eacbc982c43bee7628c5ba9d13e8f65148d4aeeb815ea1c57b` |
| 便携包中的 Windows x64 EXE | `9c82c6dcec934c45ed979ad050c3684947cfa608f31f3f3b6a839e4bf1261faf` |

解压后双击 `Start-Ningmao.vbs`。需要回退时可使用 D13 程序包接续同一工作区；D14 的波形缓存使用独立数据库。
