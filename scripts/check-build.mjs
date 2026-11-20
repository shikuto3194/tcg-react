// ビルド成果物の欠損・古い画像の残留・コピー漏れを検出する。ブラウザやDBは起動しない。
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const images = join(dist, 'images');

async function listFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(relative(images, path).split(sep).join('/'));
  }
  return files.sort();
}

const html = await readFile(join(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)=["']((?:\.\/|\/)?assets\/[^"']+)["']/g)];
assert.ok(assets.some(([, path]) => path.endsWith('.js')), 'index.html: missing JS entry');
for (const [, path] of assets) {
  assert.ok((await stat(join(dist, path.replace(/^\//, '')))).isFile(), `Missing build asset: ${path}`);
}
const files = await listFiles(images);
const manifest = JSON.parse(await readFile(join(dist, 'image-assets.json'), 'utf8'));
assert.deepEqual(files, [...new Set(Object.values(manifest).map(entry=>entry.path))].sort(), 'dist/images differs from distribution manifest');
for (const entry of Object.values(manifest)) {
  const data = await readFile(join(images, entry.path));
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  assert.equal(hash, entry.hash, `Stale or damaged build image: ${entry.path}`);
  assert.equal(data.length, entry.bytes);
}
const worker = await readFile(join(dist, 'sw.js'), 'utf8');
assert.ok(!worker.includes('__BUILD_VERSION__'), 'Offline cache version missing');
const precached = JSON.parse(worker.match(/const FILES = (\[[^\n]+\]);/)[1]);
for (const file of ['index.html', ...assets.map(([,path])=>path.replace(/^\.\//,'')), ...files.map(file=>`images/${file}`)]) {
  assert.ok(precached.includes(file), `Missing offline asset: ${file}`);
}
for (const file of precached) assert.ok((await stat(join(dist,file))).isFile(),`Missing precached file: ${file}`);
console.log(`[check-build] HTML assets OK; ${files.length} images verified; ${precached.length} offline files verified`);
