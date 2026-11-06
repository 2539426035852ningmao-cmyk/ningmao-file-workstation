import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {collectTexts} from './collect-licenses.mjs';

// Inventory the actual pinned build, not every optional module in go.mod.
const [upstreamArg,outArg]=process.argv.slice(2);
if(!upstreamArg||!outArg)throw new Error('Usage: node scripts/collect-browser-licenses.mjs <pinned-croc> <new-output>');
const upstream=resolve(upstreamArg),out=resolve(outArg),pin='4fc5ac0c8463a3de2b0396205c69a38109863583';
const run=(program,args,options={})=>execFileSync(program,args,{cwd:upstream,encoding:'utf8',maxBuffer:20_000_000,...options}).trim();
if(run('git',['rev-parse','HEAD'])!==pin)throw new Error('Expected pinned croc source');
if(existsSync(out))throw new Error('Preserve prior inventory; choose a new output directory');
const records=[];
function record(ecosystem,name,version,source,root,explicit){records.push({ecosystem,name,version,source,texts:collectTexts(root,explicit)});}
const format='{{if .Module}}{{.Module.Path}}|{{.Module.Version}}|{{.Module.Dir}}{{end}}';
const native=run('go',['list','-deps','-f',format,'.','./cmd/croc-web','./cmd/ningmao-share-proof']);
const wasm=run('go',['list','-deps','-f',format,'./sshwasm'],{cwd:join(upstream,'web'),env:{...process.env,GOOS:'js',GOARCH:'wasm'}});
for(const line of [...new Set((native+'\n'+wasm).split(/\r?\n/).filter(Boolean))].sort()){
  const [name,version,root]=line.split('|');
  record('go',name,version||pin,'https://'+name,root);
}
const web=join(upstream,'web'),lock=JSON.parse(readFileSync(join(web,'package-lock.json'),'utf8'));
for(const [path,pkg] of Object.entries(lock.packages)){
  if(!path||pkg.dev)continue;
  const root=join(web,path),installed=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  if(installed.version!==pkg.version)throw new Error('npm lock mismatch: '+path);
  const explicit=existsSync(join(root,'OFL.txt'))?'OFL.txt':undefined;
  record('npm',installed.name,pkg.version,pkg.resolved,root,explicit);
  records.at(-1).declaredLicense=pkg.license??installed.license??'UNKNOWN';
}
const goroot=run('go',['env','GOROOT']);
record('toolchain','Go standard library and wasm_exec.js',run('go',['version']),'https://go.dev',goroot,'LICENSE');
for(const path of ['internal/cli','internal/tailcat','src/codephrase/wordlists'])record('vendored',path,pin,'https://github.com/schollz/croc/tree/'+pin+'/'+path,join(upstream,path));
record('source','croc upstream notices',pin,'https://github.com/schollz/croc/tree/'+pin,upstream,'THIRD_PARTY_NOTICES.md');
const missing=records.filter(r=>!r.texts.length).map(r=>r.name);
const scope='Pinned Windows CLI/relay, web server, sender and embedded SSH WASM module graph; non-dev npm packages, vendored licenses and Go runtime. Text inventory is not distribution approval.';
const reviewRequired=['Embedded SSH/Store UI and endpoints remain outside the workstation file-sharing scope.','Review font, EFF wordlist, image/icon and source attribution before bundling.','Root upstream notices mention older Tailcat/gVisor versions; actual module versions below take precedence.'];
const packages=records.map(({texts,...r})=>({...r,files:texts.map(({text,...file})=>file)}));
const manifest={schema:1,upstreamCommit:pin,scope,missing,reviewRequired,packages};
const notices=[scope,...records.flatMap(r=>['\n'+r.ecosystem+': '+r.name+' @ '+r.version,'Source: '+r.source,...r.texts.flatMap(t=>['--- '+t.path+' SHA256 '+t.sha256+' ---',t.text])])].join('\n');
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(out,'THIRD_PARTY_NOTICES.txt'),notices);
console.log(JSON.stringify({packages:packages.length,missing,reviewRequired,noticesSha256:createHash('sha256').update(notices).digest('hex')}));
