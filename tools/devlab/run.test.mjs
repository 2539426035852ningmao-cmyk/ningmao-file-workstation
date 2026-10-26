import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passed } from './run.mjs';
import { mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
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
