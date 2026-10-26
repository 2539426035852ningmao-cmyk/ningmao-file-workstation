import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scenarios = { selection: ['multiselection.spec.ts', 6], orb: ['orb.spec.ts', 18], management: ['management-center.spec.ts', 14] };
export function passed(report, expected) {
  return report.errors?.length === 0 && report.stats?.expected === expected &&
    report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.flaky === 0;
}

function main() {
  const scenario = process.argv[2];
  if (process.argv.length !== 3 || !Object.hasOwn(scenarios, scenario)) {
    console.error('Usage: node tools/devlab/run.mjs selection|orb|management');
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
  const evidence = { scenario, scope: 'BROWSER_SYNTHETIC', native: 'NOT_TESTED', realFileHashProtection: 'NOT_EXERCISED',
    head: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').length > 0,
    node: process.version, playwright: JSON.parse(readFileSync(join(app, 'node_modules/@playwright/test/package.json'), 'utf8')).version,
    platform: process.platform, started: new Date().toISOString(), inputsBefore: digest(), steps: [], status: 'FAIL' };
  const run = (name, entry, args, env = {}) => {
    const start = performance.now();
    const result = spawnSync(process.execPath, [join(app, 'node_modules', entry), ...args], {
      cwd: app, encoding: 'utf8', windowsHide: true, timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
    appendFileSync(join(output, 'run.log'), `\n${name}\n${result.stdout || ''}${result.stderr || ''}`);
    evidence.steps.push({ name, seconds: (performance.now() - start) / 1000, exitCode: result.status });
    if (result.error || result.status !== 0) throw Error(`${name} failed; see local run.log`);
  };
  try {
    // Same build:test steps, with existing dependencies. No installation or shell interpolation.
    run('typecheck', 'typescript/bin/tsc', []);
    run('test-build', 'vite/bin/vite.js', ['build', '--mode', 'test']);
    const [file, count] = scenarios[scenario];
    run('scenario', '@playwright/test/cli.js', ['test', `tests/browser/${file}`, '--trace=on', '--reporter=line,json', '--output', join(output, 'traces')],
      { PLAYWRIGHT_JSON_OUTPUT_FILE: join(output, 'results.json') });
    const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
    evidence.stats = report.stats;
    evidence.inputsAfter = digest();
    if (!passed(report, count)) throw Error('Unexpected test count, failure, skip or flaky result');
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
