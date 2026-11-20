import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dependencyRoot, packageNotices } from '../scripts/third-party-licenses.mjs';

test('license collection resolves nested dependencies and fails on absent notices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tcg-licenses-'));
  try {
    const directory = join(root, 'node_modules', 'parent', 'node_modules', '@scope', 'child');
    await mkdir(join(directory, 'dist'), { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@scope/child', version: '2.0.0' }));
    const found = await dependencyRoot(join(directory, 'dist', 'index.js') + '?commonjs-proxy');
    assert.equal(found.metadata.name, '@scope/child');
    assert.equal((await dependencyRoot('\0' + join(directory, 'dist', 'index.js') + '?commonjs-proxy')).metadata.name, '@scope/child');
    assert.equal(await dependencyRoot(join(root, 'src', 'app.js')), null);
    await assert.rejects(packageNotices(directory), /License text missing/);
    await writeFile(join(directory, 'LICENSE'), 'Copyright Test\nPermission is hereby granted.');
    await writeFile(join(directory, 'NOTICE.txt'), 'Required attribution');
    const notices = await packageNotices(directory);
    assert.match(notices, /Copyright Test/);
    assert.match(notices, /Required attribution/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
