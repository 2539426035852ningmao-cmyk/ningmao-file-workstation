import { createHash } from 'node:crypto';
import { appendFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scenarios = { selection: ['multiselection.spec.ts', 6], orb: ['orb.spec.ts', 18], management: ['management-center.spec.ts', 14] };
export function passed(report, expected) {
  return report.errors?.length === 0 && report.stats?.expected === expected &&
    report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.flaky === 0;
}

export function fixtureEvidence(root) {
  for (const directory of [root, join(root, 'source'), join(root, 'bound-target')]) {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Unexpected fixture directory');
  }
  const marker = lstatSync(join(root, 'SYNTHETIC-ONLY.txt'));
  if (marker.isSymbolicLink() || !marker.isFile() || readFileSync(join(root, 'SYNTHETIC-ONLY.txt'), 'utf8') !== 'Agent-created synthetic fixtures, not private user files.\n') throw Error('Synthetic marker mismatch');
  const files = ['source/English.txt', 'source/中文 空格.txt', 'source/合成图片.png', 'bound-target/中文 空格.txt', 'bound-target/中文 空格 (1).txt'];
  const bytes = Object.fromEntries(files.map(file => {
    const stat = lstatSync(join(root, file));
    if (stat.isSymbolicLink() || !stat.isFile()) throw Error('Unexpected fixture file');
    return [file, readFileSync(join(root, file))];
  }));
  if (bytes[files[0]].toString('utf8') !== 'Ningmao synthetic source; keep this file.\n') throw Error('English source changed');
  for (const file of [files[1], files[3], files[4]]) {
    if (bytes[file].toString('utf8') !== '柠猫合成测试素材；请保留来源。\n') throw Error('Source or numbered copy changed');
  }
  if (!bytes[files[2]].subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('Expected generated PNG');
  return Object.fromEntries(files.map(file => [file, createHash('sha256').update(bytes[file]).digest('hex')]));
}

function main() {
  const scenario = process.argv[2];
  const nativeFixture = scenario === 'native-fixture';
  if (process.argv.length !== 3 || (!nativeFixture && !Object.hasOwn(scenarios, scenario))) {
    console.error('Usage: node tools/devlab/run.mjs selection|orb|management|native-fixture');
    process.exitCode = 2; return;
  }
  if (nativeFixture && process.platform !== 'win32') {
    console.error('native-fixture requires Windows and an existing Rust 1.99.1 toolchain');
    process.exitCode = 2; return;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const app = join(root, 'apps/desktop');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw Error('Cannot inspect source identity');
    return result.stdout.trim();
  };
  const digest = () => {
    const hash = createHash('sha256');
    for (const file of git('ls-files', '-z', '--', 'apps/desktop', 'tools/devlab').split('\0').filter(Boolean).sort()) {
      hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0');
    }
    return hash.digest('hex');
  };
  const base = join(root, 'work/devlab'); mkdirSync(base, { recursive: true });
  const output = mkdtempSync(join(base, `${scenario}-`));
  const evidence = { scenario, scope: nativeFixture ? 'RUST_STORE_SYNTHETIC' : 'BROWSER_SYNTHETIC', native: 'NOT_TESTED', realFileHashProtection: 'NOT_EXERCISED',
    head: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').length > 0,
    node: process.version, playwright: nativeFixture ? null : JSON.parse(readFileSync(join(app, 'node_modules/@playwright/test/package.json'), 'utf8')).version,
    platform: process.platform, started: new Date().toISOString(), inputsBefore: digest(), steps: [], status: 'FAIL' };
  const execute = (name, program, args, env = {}) => {
    const start = performance.now();
    const result = spawnSync(program, args, {
      cwd: app, encoding: 'utf8', windowsHide: true, timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
    appendFileSync(join(output, 'run.log'), `\n${name}\n${result.stdout || ''}${result.stderr || ''}`);
    evidence.steps.push({ name, seconds: (performance.now() - start) / 1000, exitCode: result.status });
    if (result.error || result.status !== 0) throw Error(`${name} failed; see local run.log`);
    return result.stdout;
  };
  const run = (name, entry, args, env) => execute(name, process.execPath, [join(app, 'node_modules', entry), ...args], env);
  try {
    if (nativeFixture) {
      const fixture = join(output, 'fixture'); // Existing Rust test refuses an already-existing root.
      const installed = execute('installed-rust', 'rustup', ['toolchain', 'list']).trim().split(/\r?\n/);
      const toolchain = (installed.find(line => /^1\.99\.1(?:-|\s)/.test(line)) ?? installed.find(line => /\(active(?:,|\))/.test(line)))?.split(/\s+/)[0];
      if (!toolchain || !/^[\w.-]+$/.test(toolchain)) throw Error('No suitable installed Rust toolchain');
      const version = execute('rust-version', 'rustup', ['run', toolchain, 'cargo', '--version']).trim();
      const compiler = execute('compiler-version', 'rustup', ['run', toolchain, 'rustc', '--version']).trim();
      if (!/^cargo 1\.99\.1\b/.test(version) || !/^rustc 1\.99\.1\b/.test(compiler)) throw Error('Existing Rust must match 1.99.1; no installation attempted');
      const result = execute('store-copy-fixture', 'rustup', ['run', toolchain, 'cargo', 'test', '--offline', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--test', 'candidate_fixture', 'prepare_candidate_fixture', '--', '--ignored', '--exact'],
        { NINGMAO_TEST_FIXTURE_DIR: fixture, CARGO_BUILD_JOBS: '1' });
      if (!/test result: ok\. 1 passed; 0 failed; 0 ignored;/.test(result)) throw Error('Expected the explicit fixture test to run once');
      evidence.fixtureHashes = fixtureEvidence(fixture);
      evidence.realFileHashProtection = 'SYNTHETIC_SOURCE_AND_TWO_NUMBERED_COPIES_VERIFIED';
      evidence.rust = version;
      evidence.rustc = compiler;
      evidence.rustToolchain = toolchain;
    } else {
      // Same build:test steps, with existing dependencies. No installation or shell interpolation.
      run('typecheck', 'typescript/bin/tsc', []);
      run('test-build', 'vite/bin/vite.js', ['build', '--mode', 'test']);
      const [file, count] = scenarios[scenario];
      run('scenario', '@playwright/test/cli.js', ['test', `tests/browser/${file}`, '--trace=on', '--reporter=line,json', '--output', join(output, 'traces')],
        { PLAYWRIGHT_JSON_OUTPUT_FILE: join(output, 'results.json') });
      const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
      evidence.stats = report.stats;
      if (!passed(report, count)) throw Error('Unexpected test count, failure, skip or flaky result');
    }
    evidence.inputsAfter = digest();
    if (evidence.inputsBefore !== evidence.inputsAfter) throw Error('Source/fixture changed during run');
    evidence.status = 'PASS';
  } catch (error) { evidence.error = error.message; process.exitCode = 1; }
  finally {
    evidence.finished = new Date().toISOString();
    writeFileSync(join(output, 'report.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`${evidence.status}: ${scenario}; local evidence: ${join(output, 'report.json')}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
