# M1-06 预览安装包说明

这是 0.1.0 x64 **未签名 Debug 验证包**，不是正式 Release，不代表整个 M1 或原生文件操作已验收。不要在工作时自动运行本目录内的 MSI 或 EXE。

## 内容和边界

- MSI 使用已锁定 Tauri CLI 2.12.4 / 官方 WiX 模板生成，没有复制或维护自定义安装器。
- 独立产品名 Ningmao File Workstation Preview、应用标识 app.ningmao.fileworkstation.preview、固定预览 UpgradeCode，与主候选应用标识分离。仅此预览轨道禁止降级；不会把已有正式/主候选数据迁入预览目录。
- 只构建，不执行 MSI、应用、资源管理器或输入自动化。msi-inspection.json 通过 Windows Installer 数据库只读模式读取文件清单、目录、删除动作、自定义动作、环境和注册表；这是结构检查，不能代替实际安装、升级、卸载与数据保留测试。
- 标准 WiX MSI 为 per-machine 安装，用户日后主动安装时可能需要管理员权限。标准完成页有启动选项；只有用户方便且明确安排验收时才操作。
- 此包要求系统已有 Microsoft Edge WebView2 Runtime；不附带或执行安装引导程序。正式发行前另行确定运行库分发方案。
- 未增加开机自启、提权更新任务、系统右键注册或用户数据删除动作；检查脚本不属于通用恶意安装包扫描。
- EXE 与 MSI 使用预览配置重新构建；与 M1-05 的原候选是不同文件，不能继承旧哈希的原生验收结果。EXE 不宣称便携模式；直接运行时也使用预览标识的数据目录。
- SHA256SUMS.txt 覆盖其余全部交付文件；build-manifest.json 保存实际构建源码提交。GitHub PR 构建提交可能是 head 与 base 的临时合并提交。

## 许可资料

THIRD_PARTY_NOTICES.txt 归集 Windows normal Cargo 运行依赖（排除 build / proc-macro）、npm 非 dev 锁记录（保守超集）、复制组件以及 Rust 标准库声明；license-manifest.json 记录版本、来源、原文字节 SHA256 和待核对项。根 Apache-2.0 全文单独保留。

上游包不附原文时只使用固定来源补充，不生成虚假版权声明。react-remove-scroll-bar 2.3.8 的 npm gitHead 在声明仓库中不可访问；补入上游后续 MIT 原文，并在清单保留精确发布源码映射未核对的警告。原文归集不等于完整法律、漏洞或实际二进制 SBOM 审核，原生/嵌入子组件义务与正式分发审核仍需继续完成。

## 验证和回滚

在干净 Windows checkout 中执行：

```powershell
./scripts/build-desktop.ps1 -Native
./scripts/build-preview-package.ps1
```

GitHub Actions 只上传明确白名单输出，保留 7 天，不创建 Release。输出目录非空时拒绝覆盖；重新构建使用干净 checkout。安装/卸载、Win10/11、DPI、多屏、原生拖拽及异常条件尚未逐项完成，待用户方便后集中安排。当前不合并依赖 PR、不删除主候选、不操作用户工作数据库。源码改动通过独立 PR revert 回滚；未来卸载数据策略需实际验证，不能承诺卸载会清除或保存所有内容。
