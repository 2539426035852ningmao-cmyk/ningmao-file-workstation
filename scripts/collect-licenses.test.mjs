import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectTexts } from './collect-licenses.mjs';

test('收集原始 LICENSE 与嵌套 NOTICE；拒绝包外路径', () => {
  const root = mkdtempSync(join(tmpdir(), 'ningmao-notices-'));
  try {
    mkdirSync(join(root, 'licenses'));
    writeFileSync(join(root, 'LICENSE-MIT'), 'Copyright fixture\nOriginal terms\n');
    writeFileSync(join(root, 'licenses', 'NOTICE.txt'), 'Original attribution\n');
    const texts = collectTexts(root);
    assert.deepEqual(texts.map(t => t.path), ['LICENSE-MIT', 'licenses/NOTICE.txt']);
    assert.equal(texts[0].text, 'Copyright fixture\nOriginal terms\n');
    assert.match(texts[0].sha256, /^[a-f0-9]{64}$/);
    assert.throws(() => collectTexts(root, '../private.txt'), /outside/);
    assert.deepEqual(texts, collectTexts(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
