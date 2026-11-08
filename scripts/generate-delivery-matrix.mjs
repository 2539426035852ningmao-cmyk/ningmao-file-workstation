import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const rows=path=>readFileSync(path,'utf8').split(/\r?\n/).filter(line=>/^\| \d{2} \|/.test(line)).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim()));
const original=rows('docs/product-decisions.md'),p4=rows('docs/product/P4-confirmed-decisions-01-44-2026-10-26.md');
if(original.length!==43||p4.length!==44)throw Error('Frozen decision count changed');
const sources=['apps/desktop/src/App.tsx','apps/desktop/src/Manager.tsx','apps/desktop/src-tauri/src/store.rs','apps/desktop/src-tauri/src/desktop_runtime.rs','apps/desktop/src-tauri/src/transfer_desktop.rs','apps/desktop/src-tauri/src/chat.rs'];
for(const source of sources)if(!existsSync(source))throw Error('Missing source '+source);
const lines=['# 首版功能与验收矩阵','',`生成时源码：${sha}。本文件由 scripts/generate-delivery-matrix.mjs 生成；结论仅针对下述范围，不自动继承旧 SHA 的 PASS。`, '',
'唯一当前执行状态仍在 [ACTIVE-DELIVERY](ACTIVE-DELIVERY.md)。IN_PROGRESS 表示该完整复合需求仍有缺口，并非其中每个子功能均未实现。没有逐条完整验收的项目不标 TESTED。基础与增强均保留，DEFERRED 仅用于总指令明确允许后置的视频关键帧/OCR/音频理解。', '',
'当前统一候选：PR #77 / feat/capsule-recent-focus-20261108。已用 git merge-base --is-ancestor 核实 #62 和 #68–#76 的完整 HEAD 均已包含，不重复 cherry-pick。#66 独立未吸收，首版采用现有受控窗口交接，不声称原生连续形变；#67 合同已按固定提交纳入执行依据。外部双设备/手机/公网/真实模型证据仍缺。精确运行包与最终测试见 ACTIVE-DELIVERY，不把生成时源码视为已验证二进制。', '',
'## 基础能力实际落地情况', '',
'下表拆开复合决定的基础子能力。INTEGRATED 仅表示已有可调用实现；PARTIAL 表示证据范围未覆盖完整原生闭环；NOT_STARTED 表示尚缺用户可用实现。', '',
'|功能|实现状态与代码入口|用户入口|自动与原生证据|首版阻断与下一动作|',
'|---|---|---|---|---|',
...[
 ['引用、绑定、安全复制、同名编号','INTEGRATED · src-tauri/src/store.rs','添加/粘贴/拖入；绑定架显示复制语义','Rust/CI 安全回归；旧候选原生来源哈希记录见 ACTIVE','PARTIAL：统一新包连续文件流及原生 OLE 待验'],
 ['多架、拆合、网格/列表、多选、排序','INTEGRATED · App.tsx / desktop_runtime.rs','切架菜单、更多→显示与排序','现有选择/排序/窗口测试；旧原生逐项通过','PARTIAL：新包连续闭环；文件架重命名尚缺，需补齐'],
 ['预览、本地搜索与定位','INTEGRATED · App.tsx / components/GlobalSearch.tsx / store/search.rs','Space、Ctrl+F、Ctrl+K、胶囊最近项','f7ff9c0 168 界面通过；新最近项同版原生待验','首版需完成新包最近项→选中→Space，不以按钮存在代替'],
 ['软回收、恢复、备份和 SQLite','INTEGRATED · store.rs / components/RecycleDrawer.tsx','柠猫回收站；管理中心→设置','标准 Windows CI 含回收保护；本机 .codex 路径限制保留','PARTIAL：新包回收恢复/重启与备份还原连续性待验'],
 ['三主题、球/胶囊/完整架、独立管理','INTEGRATED · orb/MorphCapsule.tsx / Manager.tsx / style.css','球→胶囊→完整架；更多→管理中心','三主题与窄窗回归；旧包原生主题/启动通过','PARTIAL：新包文字与原生闭环；#66 连续形变 NOT_INTEGRATED'],
 ['局域网互传与发现','INTEGRATED · TransferPanel.tsx / transfer_desktop.rs','选文件→发送到设备；更多→文件互传','既有合成回环/协议测试，历史专项许可不扩大','PARTIAL：独立 OS 双机、手机与防火墙边界未完整验收'],
 ['浏览器分享与随包组件','INTEGRATED · browser_share_desktop.rs / experiments/p3-browser','互传→浏览器分享（组件可用时）','相对路径、哈希、组件许可清单与本机字节证据见 #68','PARTIAL：许可仍有警告；正式发行未批准，公网/手机待验'],
 ['AI 会话与建议','INTEGRATED · ChatPanel.tsx / src-tauri/src/chat.rs','AI 面板配置兼容端点后对话','现有受控 SSE 测试；不等于真实模型通过','PARTIAL：Anthropic 独立协议适配及本地模型有限实测待补；无密钥不调用云'],
 ['本地规则标签、插件及工作流','PARTIAL · localTagSuggestions.ts / Manager.tsx','管理中心→标签建议→确认写内部标签','已有规则/确认写入实现，无后台文件修改','首版阻断：低权限示范生命周期与可恢复工作流未完成；不造市场'],
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
 const state=advanced?'DEFERRED':plugin?'NOT_STARTED':'IN_PROGRESS';
 const src=plugin?'示范基础可复用 apps/desktop/src/localTagSuggestions.ts；插件生命周期未实现':n>=40?sources[2]:n===28?sources[5]:'apps/desktop/src-tauri/src/store/search.rs；apps/desktop/src/Manager.tsx';
 lines.push(`|P4-${id}|${title}：${text}|${state}|${src}|${plugin?'管理中心规则建议已有，插件管理入口尚缺':n===28?'AI对话/配置':'搜索/管理中心；完整闭环待补'}|已有局部测试，完整需求未验收|NOT_TESTED（完整条目）|${advanced?'总指令允许后置高级理解，元数据基础仍需验收':plugin?'阻断：复用规则引擎补安装/启停/权限/卸载，用户标签保留':'需补齐完整闭环；模型/设备依赖单列，不静默延期'}|`);
}
for(const [id,text,src,entry,next] of [
 ['D05-1','Orb→Capsule→Full，移除独立QuickPeek','apps/desktop/src/orb/MorphCapsule.tsx；src-tauri/src/entry.rs','球→含最近3项/数量/添加/粘贴的胶囊→完整架；最近项定位；Esc收回球','添加/粘贴和双启动已实现并有旧包原生证据，最近项待同版原生；#66连续形变独立，不阻塞受控交接候选'],
 ['D05-2','白/深蓝/亮蓝三套完整主题','apps/desktop/src/style.css；preferences.ts','文件架更多→显示与排序/管理中心设置/入口主题；所有窗口同步','三套Token、跨窗与旧包原生已测；当前蓝色小字对比修正及新包视觉待最终证据'],
 ['D05-3','管理中心三栏、独立窗口','apps/desktop/src/Manager.tsx','文件与素材/任务中心/设置；原文件架/素材/标签下沉二级','三栏目和独立窗口已实现且旧包原生通过；跨传输任务汇总仍需补齐'],
 ['D05-4','单主要辅助面板及上下文保持',sources[0],'预览/搜索/互传/AI','Ctrl+K不再叠加现有模态面板、AI草稿保留已测；异步结果/固定详情仍需整体仲裁'],
 ])lines.push(`|${id}|${text}|IN_PROGRESS|${src}|${entry}|探针/旧界面局部证据，产品闭环未验|PARTIAL|首版阻断：${next}|`);
writeFileSync('docs/execution/V01-feature-matrix.md',lines.join('\n')+'\n');
console.log('Generated 43 + 44 frozen decisions and 4 D05 requirement groups.');
