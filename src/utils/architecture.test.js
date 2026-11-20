import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';

test('実行モジュールに循環依存がなく、共通処理はストアや画面を参照しない', async () => {
  const root = resolve('src');
  const modules = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(js|jsx)$/.test(path) && !path.endsWith('.test.js')) {
        const source = await readFile(path, 'utf8');
        const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
        const targets = [];
        for (const specifier of imports.filter(value => value.startsWith('.'))) {
          const base = resolve(dirname(path), specifier);
          for (const candidate of [base, `${base}.js`, `${base}.jsx`]) {
            if (/\.(js|jsx)$/.test(candidate) && (await stat(candidate).catch(() => null))?.isFile()) { targets.push(candidate); break; }
          }
        }
        modules.set(path, targets);
      }
    }
  }
  await visit(root);
  const complete = new Set();
  function check(path, chain = []) {
    assert.ok(!chain.includes(path), `Circular dependency: ${[...chain, path].map(file => relative(root, file)).join(' -> ')}`);
    if (complete.has(path)) return;
    for (const dependency of modules.get(path) || []) check(dependency, [...chain, path]);
    complete.add(path);
  }
  for (const path of modules.keys()) check(path);
  for (const [path, dependencies] of modules) if (relative(root, path).replaceAll('\\', '/').startsWith('utils/')) {
    for (const dependency of dependencies) assert.ok(!dependency.endsWith('.jsx') && dependency !== resolve(root, 'local/store.js'), `${path} depends on UI/store: ${dependency}`);
  }
});
