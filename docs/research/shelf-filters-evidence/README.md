# 当前架组合筛选证据

2026-10-24，feat/shelf-file-filters；合成记录、隔离harness，不读取用户素材或账号数据。

drawer-340-light.png / drawer-420-dark.png / drawer-640-light.png 显示按需筛选抽屉；active-* 同尺寸图片显示筛选激活、来源语义与选中操作仍可见。抽屉截图等待进入视口，窄窗可滚动访问底部按钮。verification.json记录底座与最终截图哈希，精确源码、CI和候选身份在PR/Issue #27中记录。

复现：设置FILTER_EVIDENCE为输出目录，构建测试入口，运行shelf-filters.spec.ts。截图仅证明浏览器展示和交互，不证明Windows原生选择框、DPI、真实文件操作或安装验收。
