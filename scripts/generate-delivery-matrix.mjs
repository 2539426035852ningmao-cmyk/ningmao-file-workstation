import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0;
const rows=path=>readFileSync(path,'utf8').split(/\r?\n/).filter(line=>/^\| \d{2} \|/.test(line)).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim()));
const original=rows('docs/product-decisions.md'),p4=rows('docs/product/P4-confirmed-decisions-01-44-2026-10-26.md');
if(original.length!==43||p4.length!==44)throw Error('Frozen decision count changed');
const sources=['apps/desktop/src/App.tsx','apps/desktop/src/Manager.tsx','apps/desktop/src-tauri/src/store.rs','apps/desktop/src-tauri/src/desktop_runtime.rs','apps/desktop/src-tauri/src/transfer_desktop.rs','apps/desktop/src-tauri/src/chat.rs'];
for(const source of sources)if(!existsSync(source))throw Error('Missing source '+source);
const lines=['# 首版功能与验收矩阵','',`生成基线：${sha}${dirty?"（工作树含本批修改）":""}；最终构建提交以 build-manifest 为准。本文件由 scripts/generate-delivery-matrix.mjs 生成；结论仅针对下述范围，不自动继承旧 SHA 的 PASS。`, '',
'唯一当前执行状态仍在 [ACTIVE-DELIVERY](ACTIVE-DELIVERY.md)。IN_PROGRESS 表示该完整复合需求仍有缺口，并非其中每个子功能均未实现。没有逐条完整验收的项目不标 TESTED。基础与增强均保留，DEFERRED 仅用于总指令明确允许后置的视频关键帧/OCR/音频理解。', '',
'当前集成分支 integration/windows-web-closeout-20261112 基于 #92 的65ab738a6，选择补入 #77 最新片段邀请/等待提示与隔离实验，不是完整历史合并。#88/#89/#91的WebRTC和WSS安全代码保留，#66独立，#90只作main导航。新组合实机、正式公网和发行仍待验；旧Android单向合成证据只适用于croc实验。精确SHA/测试/包见ACTIVE-DELIVERY，不继承旧HEAD绿灯。', '',
'## 基础能力实际落地情况', '',
'下表拆开复合决定的基础子能力。INTEGRATED 仅表示已有可调用实现；PARTIAL 表示证据范围未覆盖完整原生闭环；NOT_STARTED 表示尚缺用户可用实现。', '',
'|功能|实现状态与代码入口|用户入口|自动与原生证据|首版阻断与下一动作|',
'|---|---|---|---|---|',
...[
 ['引用、绑定、安全复制、同名编号','INTEGRATED · src-tauri/src/store.rs','添加/粘贴/拖入；绑定架显示复制语义','10215e7 同EXE原生添加/正常绑定/编号复制/来源及旧目标SHA保护通过','PARTIAL：添加→复制→软回收/撤销→重启已验；93d14cc Space原生子集通过，OLE新包仍未验'],
 ['多架、重命名、拆合、网格/列表、多选、排序','INTEGRATED · App.tsx / desktop_runtime.rs','切架菜单、更多→显示与排序','现有选择/排序/窗口测试；旧原生逐项通过','10215e7 原生改名并同EXE重启保留，架ID及文件字节不变；全DPI/多屏另验'],
 ['预览、本地搜索与定位','INTEGRATED · App.tsx / components/GlobalSearch.tsx / store/search.rs','Space、Ctrl+F、Ctrl+K、胶囊最近项','5608c37原生最近项/搜索/详情通过；93d14cc三CI成功、24定向界面及新EXE原生Space打开English.txt/Esc关闭通过','PARTIAL：Space子集已验，完整连续文件流、全DPI和多屏仍待验'],
 ['软回收、恢复、备份和 SQLite','INTEGRATED · store.rs / components/RecycleDrawer.tsx','柠猫回收站；管理中心→设置','10215e7 经批准只软回收ID8后撤销，原生重启记录/哈希/任务完全一致；SQLite完整','PARTIAL：软回收/恢复/重启通过；原生备份还原和Windows回收站另验'],
 ['三主题、球/胶囊/完整架、独立管理','INTEGRATED · orb/MorphCapsule.tsx / Manager.tsx / style.css','球→胶囊→完整架；更多→管理中心','三主题与窄窗回归；旧包原生主题/启动通过','PARTIAL：新包文字与原生闭环；#66 连续形变 NOT_INTEGRATED'],
 ['任务记录与取消','INTEGRATED · Manager.tsx / App.tsx / store.rs','管理中心→任务中心；文件架→更多→任务记录','20b1c08：36本地定向/170远端全界面/三CI通过，原生独立管理→任务中心及2记录展示通过','保留最近20项、架/状态筛选和真实进度；不新建任务数据库'],
 ['局域网互传与发现','INTEGRATED · TransferPanel.tsx / transfer_desktop.rs','选文件→发送到设备；更多→文件互传','既有合成回环/协议测试，历史专项许可不扩大','PARTIAL：独立 OS 双机、手机与防火墙边界未完整验收'],
 ['浏览器分享与随包组件','INTEGRATED · browser_share_desktop.rs / experiments/p3-browser','互传→本机浏览器测试（组件可用时）','补入片段邀请与准确最长等待；旧croc Android78B实测见独立研究报告','PARTIAL：croc非正式第二公网入口；W1–W3独立实现/证据，许可与新包实机待验'],
 ['AI 会话与建议','INTEGRATED · ChatPanel.tsx / src-tauri/src/chat.rs','AI 面板配置兼容端点后对话','Anthropic专用HTTP/SSE三轮与错误/空流/断流MOCK_PASS，兼容路线原6回归PASS；用户批准单次本地GGUF HTTP返回OK（3token），非应用整链或Anthropic LIVE','PARTIAL：官方Anthropic文本适配已实现，不支持自定义Anthropic网关；厂商LIVE/应用本地模型整链/Agent工具与规则生命周期待验；云端未调用'],
 ['本地规则标签、插件及工作流','PARTIAL · localTagSuggestions.ts / Manager.tsx','管理中心→标签建议→确认写内部标签','内置示范复用规则：只传ID/名称/类型/已有标签；启停记忆、明确确认、单次撤销及停用保留成果，19界面通过','PARTIAL：内置规则最小闭环已实现；第三方安装/卸载/升级/强隔离及可恢复通用工作流未实现，不冒称插件平台'],
].map(cells=>'|'+cells.join('|')+'|'), '',
'## 冻结需求完整约束', '',
'|需求|完整约束|状态|源码入口|用户入口|自动测试/证据|Windows原生|首版阻断/风险与下一步|','|---|---|---|---|---|---|---|---|'];
for(const [id,,text] of original){
 const n=+id;
 const src=n>=35?'README.md；AGENTS.md；docs/third-party.md':n===33||n===34||[4,19,22,23,24].includes(n)?sources[3]:n===27||n===28?sources[1]:sources[0]+'；'+sources[2];
 lines.push(`|V0.1-${id}|${text}|${n===43?'INTEGRATED':'IN_PROGRESS'}|${src}|${n>=35?'工程/仓库与原冻结文档':n===33||n===34?'悬浮入口/Dock':n===27||n===28?'管理中心':'文件架/菜单；工程决定见原冻结文档'}|现有专项见 ACTIVE-DELIVERY；此完整条目未逐项重新验收|PARTIAL，精确旧SHA按原证据保留|${n===43?'非阻断：仓库已建立': '需逐条补齐子能力与同候选验收；不据单项通过推断整条完成'}|`);
}
for(const [id,,title,text] of p4){
 const n=+id,plugin=n>=29&&n<=39,advanced=[18,19,20].includes(n);
 const state=advanced?'DEFERRED':plugin&&!([31,35,37,39].includes(n))?'NOT_STARTED':'IN_PROGRESS';
 const src=plugin?'apps/desktop/src/localTagSuggestions.ts；Manager.tsx；内置示范启停/单次撤销已有，第三方生命周期未实现':n>=40?sources[2]:n===28?sources[5]:'apps/desktop/src-tauri/src/store/search.rs；apps/desktop/src/Manager.tsx';
 lines.push(`|P4-${id}|${title}：${text}|${state}|${src}|${plugin?'管理中心→素材→本地规则建议；第三方插件管理入口尚缺':n===28?'AI对话/配置':'搜索/管理中心；完整闭环待补'}|已有局部测试，完整需求未验收|NOT_TESTED（完整条目）|${advanced?'总指令允许后置高级理解，元数据基础仍需验收':plugin?'内置示范启停/结果保留/确认撤销已做；外部插件安装/权限/卸载/升级仍缺，不将内置开关冒称完整安装器':'需补齐完整闭环；模型/设备依赖单列，不静默延期'}|`);
}
for(const [id,text,src,entry,next] of [
 ['D05-1','Orb→Capsule→Full，移除独立QuickPeek','apps/desktop/src/orb/MorphCapsule.tsx；src-tauri/src/entry.rs','球→含最近3项/数量/添加/粘贴的胶囊→完整架；最近项定位；Esc收回球','添加/粘贴和双启动已实现并有旧包原生证据，最近项待同版原生；#66连续形变独立，不阻塞受控交接候选'],
 ['D05-2','白/深蓝/亮蓝三套完整主题','apps/desktop/src/style.css；preferences.ts','文件架更多→显示与排序/管理中心设置/入口主题；所有窗口同步','三套Token、跨窗与旧包原生已测；当前蓝色小字对比修正及新包视觉待最终证据'],
 ['D05-3','管理中心三栏、独立窗口','apps/desktop/src/Manager.tsx','文件与素材/任务中心/设置；原文件架/素材/标签下沉二级','三栏目和独立窗口已实现且旧包原生通过；跨传输任务汇总仍需补齐'],
 ['D05-4','单主要辅助面板及上下文保持',sources[0],'预览/搜索/互传/AI','Ctrl+K不再叠加现有模态面板、AI草稿保留已测；异步结果/固定详情仍需整体仲裁'],
 ])lines.push(`|${id}|${text}|IN_PROGRESS|${src}|${entry}|探针/旧界面局部证据，产品闭环未验|PARTIAL|首版阻断：${next}|`);
writeFileSync('docs/execution/V01-feature-matrix.md',lines.join('\n')+'\n');
console.log('Generated 43 + 44 frozen decisions and 4 D05 requirement groups.');
