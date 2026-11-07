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
'当前统一候选：#68 继承 #62 ffb8bc8；#66 独立未吸收；#64 D05/#67 为实施依据。main fc8903d。普通 Windows 候选与浏览器组件开发包分清，外部双设备/手机/公网/真实模型证据尚缺。', '',
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
 ['D05-1','Orb→Capsule→Full，移除独立QuickPeek','apps/desktop/src/DesktopEntry.tsx','桌面入口','吸收#66有界探针；OLE目标几何冻结回归'],
 ['D05-2','白/深蓝/亮蓝三套完整主题','apps/desktop/src/style.css','所有窗口/面板','迁移旧主题与球体独立配色，统一Token'],
 ['D05-3','管理中心三栏、独立窗口','apps/desktop/src/Manager.tsx','文件与素材/任务中心/设置；原文件架/素材/标签下沉二级','三栏目已实现并经浏览器回归；新包原生及最终视觉待验'],
 ['D05-4','单主要辅助面板及上下文保持',sources[0],'预览/搜索/互传/AI','Ctrl+K不再叠加现有模态面板、AI草稿保留已测；异步结果/固定详情仍需整体仲裁'],
 ])lines.push(`|${id}|${text}|IN_PROGRESS|${src}|${entry}|探针/旧界面局部证据，产品闭环未验|PARTIAL|首版阻断：${next}|`);
writeFileSync('docs/execution/V01-feature-matrix.md',lines.join('\n')+'\n');
console.log('Generated 43 + 44 frozen decisions and 4 D05 requirement groups.');
