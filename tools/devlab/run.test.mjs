import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passed, fixtureEvidence } from './run.mjs';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('a successful process cannot hide missing tests, skips, flakes or runner errors', () => {
  const good = { errors: [], stats: { expected: 6, unexpected: 0, skipped: 0, flaky: 0 } };
  assert.equal(passed(good, 6), true);
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky']) {
    assert.equal(passed({ ...good, stats: { ...good.stats, [key]: key === 'expected' ? 5 : 1 } }, 6), false);
  }
  assert.equal(passed({ ...good, errors: [{ message: 'server failed' }] }, 6), false);
  assert.equal(passed({}, 6), false);
});

test('unknown scenarios and extra paths are rejected before creating artifacts or invoking tools', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'ningmao-cli-reject-'));
  try {
    for (const args of [[], ['__proto__'], ['../private'], ['selection', 'unexpected-path']]) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url)), ...args], {
        cwd: fixture, encoding: 'utf8', windowsHide: true,
      });
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^Usage:/);
      assert.deepEqual(readdirSync(fixture), []);
    }
  } finally { rmdirSync(fixture); }
});

test('native fixture evidence rejects changed sources or numbered copies, even after a successful test', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'ningmao-fixture-guard-'));
  const files = ['SYNTHETIC-ONLY.txt', 'source/English.txt', 'source/中文 空格.txt', 'source/合成图片.png', 'bound-target/中文 空格.txt', 'bound-target/中文 空格 (1).txt'];
  try {
    mkdirSync(join(fixture, 'source')); mkdirSync(join(fixture, 'bound-target'));
    writeFileSync(join(fixture, files[0]), 'Agent-created synthetic fixtures, not private user files.\n');
    writeFileSync(join(fixture, files[1]), 'Ningmao synthetic source; keep this file.\n');
    for (const file of [files[2], files[4], files[5]]) writeFileSync(join(fixture, file), '柠猫合成测试素材；请保留来源。\n');
    writeFileSync(join(fixture, files[3]), readFileSync(new URL('../../apps/desktop/src-tauri/icons/128x128.png', import.meta.url)));
    assert.equal(Object.keys(fixtureEvidence(fixture)).length, 5);
    for (const file of [files[1], files[2], files[4], files[5]]) {
      const original = readFileSync(join(fixture, file));
      writeFileSync(join(fixture, file), 'changed');
      assert.throws(() => fixtureEvidence(fixture));
      writeFileSync(join(fixture, file), original);
    }
  } finally {
    for (const file of files) unlinkSync(join(fixture, file));
    rmdirSync(join(fixture, 'source')); rmdirSync(join(fixture, 'bound-target')); rmdirSync(fixture);
  }
});
