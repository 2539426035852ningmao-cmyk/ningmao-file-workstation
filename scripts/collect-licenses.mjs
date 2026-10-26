import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const portable = path => path.split(sep).join('/');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function inside(root, file) {
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('license path outside package');
}
export function collectTexts(root, explicit) {
  root = realpathSync(root);
  const files = new Set();
  function add(file) {
    inside(root, resolve(file));
    const actual = realpathSync(file);
    inside(root, actual);
    files.add(actual);
  }
  function walk(folder, depth = 0) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (entry.isDirectory() && depth < 3 && (depth > 0 || /^(licenses?|notices?|copying)$/i.test(entry.name))) {
        inside(root, realpathSync(file));
        walk(file, depth + 1);
      } else if (entry.isFile() && (depth > 0 || /^(licen[cs]e|copying|copyright|notice)([._-]|$)/i.test(entry.name))) add(file);
    }
  }
  if (explicit) add(resolve(root, explicit));
  walk(root, /^(licenses?|notices?)$/i.test(basename(root)) ? 1 : 0);
  return [...files].sort(compare).map(file => {
    const bytes = readFileSync(file);
    if (bytes.length > 2_000_000 || bytes.includes(0)) throw new Error('unexpected license binary/size');
    return { path: portable(relative(root, file)), sha256: sha(bytes), text: bytes.toString('utf8') };
  });
}

export function collect(repo) {
  const app = join(repo, 'apps/desktop');
  const manifestPath = join(app, 'src-tauri/Cargo.toml');
  const cargo = args => execFileSync('cargo', args, { encoding: 'utf8', maxBuffer: 20_000_000 });
  const metadata = JSON.parse(cargo(['metadata', '--locked', '--format-version', '1', '--manifest-path', manifestPath, '--filter-platform', 'x86_64-pc-windows-msvc']));
  const runtime = new Set(cargo(['tree', '--locked', '--manifest-path', manifestPath, '--target', 'x86_64-pc-windows-msvc', '--edges', 'normal,no-proc-macro', '--prefix', 'none', '--format', '{p}'])
    .split(/\r?\n/).map(line => line.replace(/ \(\*\)$/, '').trim()));
  const overrides = json(join(repo, 'licenses/package-overrides.json'));
  const records = [];
  function record(ecosystem, name, version, license, source, folder, licenseFile) {
    let texts = collectTexts(folder, licenseFile);
    let note;
    const override = overrides.find(o => o.ecosystem === ecosystem && o.name === name && o.version === version);
    if (!texts.length && override) {
      texts = collectTexts(join(repo, 'licenses')).filter(t => t.path === override.file);
      if (texts.length !== 1 || texts[0].sha256 !== override.sha256) throw new Error('license override hash mismatch: ' + name);
      source = override.source;
      note = override.note;
    }
    records.push({ ecosystem, name, version, license, source, ...(note ? { note } : {}), texts });
  }
  for (const pkg of metadata.packages) {
    if (!pkg.source || !runtime.has(pkg.name + ' v' + pkg.version)) continue;
    record('cargo', pkg.name, pkg.version, pkg.license, pkg.repository ?? pkg.source, dirname(pkg.manifest_path), pkg.license_file);
  }
  const lock = json(join(app, 'package-lock.json'));
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (!path || pkg.dev) continue;
    const folder = resolve(app, path);
    inside(app, folder);
    if (!existsSync(folder)) throw new Error('production npm package not installed: ' + path);
    const installed = json(join(folder, 'package.json'));
    if (installed.version !== pkg.version) throw new Error('npm lock/install version mismatch: ' + path);
    const repository = typeof installed.repository === 'string' ? installed.repository : installed.repository?.url;
    record('npm', installed.name, pkg.version, pkg.license ?? installed.license, repository ?? pkg.resolved, folder);
  }
  // Copied UI/template source is not represented by npm/Cargo package metadata.
  records.push({ ecosystem: 'source', name: 'repository-copied-components', version: 'see docs/third-party.md',
    license: 'MIT', source: 'docs/third-party.md', texts: collectTexts(join(repo, 'licenses')).filter(t => t.path.endsWith('.txt')) });
  // The compiler's static standard library also contributes code to the executable.
  const rustVersion = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
  const rustRoot = execFileSync('rustc', ['--print', 'sysroot'], { encoding: 'utf8' }).trim();
  const rustTexts = collectTexts(join(rustRoot, 'share/doc/rust/licenses'));
  const copyright = readFileSync(join(rustRoot, 'share/doc/rust/COPYRIGHT-library.html'));
  rustTexts.push({ path: 'COPYRIGHT-library.html', sha256: sha(copyright), text: copyright.toString('utf8') });
  records.push({ ecosystem: 'toolchain', name: 'Rust standard library', version: rustVersion,
    license: 'see bundled notices', source: 'https://github.com/rust-lang/rust', texts: rustTexts });
  records.sort((a, b) => compare(a.ecosystem + '/' + a.name + '/' + a.version, b.ecosystem + '/' + b.name + '/' + b.version));
  const missing = records.filter(r => !r.texts.length).map(({ ecosystem, name, version }) => ({ ecosystem, name, version }));
  const warnings = records.filter(r => r.note).map(({ ecosystem, name, version, note }) => ({ ecosystem, name, version, note }));
  const scope = 'Windows x64 normal Cargo dependencies (excluding build/proc-macro), installed non-dev npm lock entries (conservative superset), copied source notices and Rust toolchain root notices. Collected text is not a complete legal/security audit or byte-level SBOM; bundled/native subcomponent obligations still require review.';
  const manifest = { schema: 1, scope, missing, warnings, packages: records.map(({ texts, ...r }) => ({ ...r, files: texts.map(({ text, ...t }) => t) })) };
  const text = ['Ningmao File Workstation Preview — THIRD PARTY NOTICES', scope,
    'Open review items: ' + JSON.stringify({ missing, warnings }, null, 2),
    ...records.flatMap(r => ['\n' + '='.repeat(72), r.ecosystem + ': ' + r.name + '@' + r.version, 'Declared license: ' + r.license, 'Source: ' + r.source,
      ...(r.note ? [r.note] : []), ...r.texts.flatMap(t => ['\n--- ' + t.path + ' SHA256 ' + t.sha256 + ' ---\n', t.text])])].join('\n');
  const out = join(app, '.license-bundle');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(out, 'THIRD_PARTY_NOTICES.txt'), text);
  if (missing.length) throw new Error('missing license texts: ' + JSON.stringify(missing));
  return { packages: records.length, warnings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(collect(resolve(dirname(fileURLToPath(import.meta.url)), '..')), null, 2));
}
