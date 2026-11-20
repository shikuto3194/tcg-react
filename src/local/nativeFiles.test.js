import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { nativeImportFile, saveAIFile, saveNativeBlob, saveNativeFiles } from './nativeFiles.js';
import { initializeLibrary, importCardFiles, flushLibrary, getLocalCards, exportLibrary } from './store.js';
import { validateLibrary, LIBRARY_FORMAT } from './backup.js';

test('大きなネイティブ保存は分割転送し、取消・部分書込・失敗を扱う', async t => {
  const previous = globalThis.window;
  t.after(() => { globalThis.window = previous; });
  const source = Uint8Array.from({ length: 1024 * 1024 + 17 }, (_, i) => i % 251);
  let cancel = false, failure = false, position = 0, chunks = [], closed = [], opened = [];
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    if (command === 'plugin:dialog|save') return cancel ? null : 'C:/test/output';
    if (command === 'plugin:fs|open') { opened.push(args); return args.options.read ? 2 : 1; }
    if (command === 'plugin:fs|read') {
      assert.ok(args.len <= 256 * 1024);
      const bytes = source.slice(position, position + Math.min(args.len, 131071));
      position += bytes.length;
      const result = new Uint8Array(bytes.length + 8);
      result.set(bytes); new DataView(result.buffer).setBigUint64(bytes.length, BigInt(bytes.length));
      return result.buffer;
    }
    if (command === 'plugin:fs|write') {
      assert.ok(args.data.length <= 256 * 1024);
      if (failure) throw new Error('disk full');
      const count = Math.min(args.data.length, 100003);
      chunks.push(Buffer.from(args.data.subarray(0, count))); return count;
    }
    if (command === 'plugin:resources|close') { closed.push(args.rid); return; }
    throw new Error(`Unexpected unbounded transfer: ${command}`);
  } } };
  const exported = { name: 'backup.json', path: '/app/ai-exports/backup.json' };
  assert.equal((await saveAIFile(exported)).status, 'saved');
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(source));
  assert.deepEqual(closed, [2, 1]);
  assert.deepEqual(opened[0].options, { write: true, create: true, truncate: true });
  chunks = []; closed = []; opened = [];
  assert.equal((await saveNativeBlob(new Blob([source]), 'backup.json')).status, 'saved');
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(source));
  assert.deepEqual(closed, [1]);
  cancel = true; opened = []; position = 0;
  assert.equal((await saveAIFile(exported)).status, 'cancelled');
  assert.equal(opened.length, 0); assert.equal(position, 0);
  cancel = false; failure = true; closed = [];
  await assert.rejects(saveAIFile(exported), /disk full/);
  assert.deepEqual(closed, [2, 1]);
});

test('Android保存はプロバイダーの完了処理を待ち、失敗時にも一時ファイルを片付ける', async t => {
  const previous = globalThis.window;
  t.after(() => { globalThis.window = previous; });
  const calls = [], chunks = [];
  let failCopy = false;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'plugin:dialog|save') return 'content://documents/output';
    if (command === 'plugin:path|resolve_directory') return '/cache';
    if (command === 'plugin:path|join') return args.paths.join('/');
    if (command === 'plugin:fs|mkdir' || command === 'plugin:fs|remove' || command === 'plugin:resources|close') return;
    if (command === 'plugin:fs|open') { assert.match(args.path, /^\/cache\/tcg-exports\/.+\.tmp$/); return 1; }
    if (command === 'plugin:fs|write') { chunks.push(Buffer.from(args.data)); return args.data.length; }
    if (command === 'plugin:tcg-folder|copy_document') {
      assert.equal(args.file.uri, 'content://documents/output');
      if (failCopy) throw new Error('provider rejected write');
      return;
    }
    throw new Error(`Unexpected transfer: ${command}`);
  } } };
  const data = new Uint8Array(600000).fill(42);
  assert.equal((await saveNativeBlob(new Blob([data]), 'backup.json')).status, 'saved');
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(data));
  assert.ok(chunks.every(bytes => bytes.length <= 256 * 1024));
  const copyAt = calls.findIndex(x => x.command === 'plugin:tcg-folder|copy_document');
  assert.equal(calls[copyAt - 1].command, 'plugin:resources|close');
  assert.equal(calls.at(-1).command, 'plugin:fs|remove');
  calls.length = 0;
  await saveAIFile({ name: 'backup.json', path: '/app/ai-exports/backup.json' });
  assert.deepEqual(calls.map(x => x.command), ['plugin:dialog|save', 'plugin:tcg-folder|copy_document']);
  assert.equal(calls[1].args.file.path, '/app/ai-exports/backup.json');
  calls.length = 0; failCopy = true;
  await assert.rejects(saveNativeBlob(new Blob([data]), 'backup.json'), /provider rejected write/);
  assert.equal(calls.at(-1).command, 'plugin:fs|remove');
});

test('ネイティブのフォルダ画像は形式と相対名を保ち、再読込とバックアップができる', async t => {
  const { window } = new JSDOM();
  const previous = globalThis.File;
  globalThis.File = window.File;
  t.after(() => { globalThis.File = previous; window.close(); });
  let stored = { format: LIBRARY_FORMAT, activeGameId: 'native-test', games: [{ gameId: 'native-test', name: '取込確認', cards: [], settings: { labels: [], source: 'folder' }, storage: {} }] };
  const adapter = { read: async () => structuredClone(stored), write: async value => { stored = structuredClone(value); } };
  await initializeLibrary(adapter);
  const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ZkAAAAASUVORK5CYII=', 'base64'));
  const file = nativeImportFile(bytes, '取込確認/第1弾/カード.PNG');
  const image = await new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  assert.equal(file.name, 'カード.PNG');
  assert.match(image, /^data:image\/png;base64,/);
  const images = [{ path: file.webkitRelativePath, image }];
  importCardFiles(images, []);
  const id = getLocalCards()[0].id;
  importCardFiles(images, []);
  await flushLibrary();
  await initializeLibrary(adapter);
  assert.equal(getLocalCards().length, 1);
  assert.equal(getLocalCards()[0].id, id);
  assert.equal(getLocalCards()[0].image, image);
  assert.equal(getLocalCards()[0].mockFolder, '第1弾');
  assert.equal(getLocalCards()[0].mockPath, file.webkitRelativePath);
  const backup = validateLibrary(await exportLibrary());
  assert.equal(backup.games[0].cards[0].image, image);
});

test('Windowsの一括保存は選択1回で全内容を保存し、取消と途中失敗を区別する', async t => {
  const previous = globalThis.window;
  t.after(() => { globalThis.window = previous; });
  const source = new Uint8Array(700001).fill(53);
  const outputs = new Map(), handles = new Map(), calls = [];
  let cancel = false, failName = '', nextId = 1;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'plugin:dialog|open') { assert.equal(args.options.directory, true); assert.equal(args.options.recursive, true); return cancel ? null : 'C:/chosen'; }
    if (command === 'plugin:path|join') return args.paths.join('/');
    if (command === 'plugin:fs|mkdir') return;
    if (command === 'plugin:fs|open') {
      const id = nextId++;
      if (args.options.read) { handles.set(id, { input: true, offset: 0 }); return id; }
      assert.deepEqual(args.options, { write: true, createNew: true });
      assert.ok(!outputs.has(args.path)); outputs.set(args.path, []);
      handles.set(id, { path: args.path }); return id;
    }
    if (command === 'plugin:fs|write') {
      const path = handles.get(args.rid).path;
      if (path.endsWith(failName) && failName) throw new Error('disk full');
      assert.ok(args.data.length <= 256 * 1024);
      const count = Math.min(args.data.length, 170001);
      outputs.get(path).push(Buffer.from(args.data.subarray(0, count))); return count;
    }
    if (command === 'plugin:fs|read') {
      const handle = handles.get(args.rid), bytes = source.slice(handle.offset, handle.offset + Math.min(args.len, 150001));
      handle.offset += bytes.length;
      const result = new Uint8Array(bytes.length + 8); result.set(bytes);
      new DataView(result.buffer).setBigUint64(bytes.length, BigInt(bytes.length)); return result.buffer;
    }
    if (command === 'plugin:resources|close') { handles.delete(args.rid); return; }
    if (command === 'plugin:fs|remove') { outputs.delete(args.path); return; }
    throw new Error(`Unexpected call: ${command}`);
  } } };
  const files = [{ name: '../sample.pdf', blob: new Blob([source]) }, { name: '../SAMPLE.pdf', path: '/ai/source.pdf' }, { name: 'CON.json', blob: new Blob(['{}']) }];
  const saved = await saveNativeFiles(files);
  assert.equal(saved.status, 'saved'); assert.equal(saved.count, 3);
  assert.equal(calls.filter(x => x.command === 'plugin:dialog|open').length, 1);
  assert.deepEqual([...outputs.keys()].map(path => path.slice(saved.path.length + 1)), ['.._sample.pdf', '.._SAMPLE (2).pdf', '_CON.json']);
  const values = [...outputs.values()].map(chunks => Buffer.concat(chunks));
  assert.deepEqual(values, [Buffer.from(source), Buffer.from(source), Buffer.from('{}')]);
  assert.equal(handles.size, 0);
  calls.length = 0; cancel = true;
  assert.equal((await saveNativeFiles(files)).status, 'cancelled');
  assert.deepEqual(calls.map(x => x.command), ['plugin:dialog|open']);
  cancel = false; failName = '.._SAMPLE (2).pdf';
  await assert.rejects(saveNativeFiles(files), /3件中1件.*残りは保存できませんでした.*disk full/);
  assert.equal(handles.size, 0);
  assert.equal(outputs.size, 4); // Three earlier files and the complete first file of this attempt.
  assert.equal(calls.at(-1).command, 'plugin:fs|remove');
});

test('Androidの一括保存は1回の選択へ渡し、一時データだけを成功・取消・失敗後に削除する', async t => {
  const previous = globalThis.window, descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Android' }, configurable: true });
  t.after(() => { globalThis.window = previous; Object.defineProperty(globalThis, 'navigator', descriptor); });
  const calls = [], written = [];
  let outcome = 'saved';
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'plugin:path|resolve_directory') return '/cache';
    if (command === 'plugin:path|join') return args.paths.join('/');
    if (command === 'plugin:fs|mkdir' || command === 'plugin:fs|remove' || command === 'plugin:resources|close') return;
    if (command === 'plugin:fs|open') { assert.match(args.path, /^\/cache\/tcg-exports\/.+\.tmp$/); return 1; }
    if (command === 'plugin:fs|write') { assert.ok(args.data.length <= 256 * 1024); written.push(Buffer.from(args.data)); return args.data.length; }
    if (command === 'plugin:tcg-folder|save_files') {
      assert.equal(args.batch.files.length, 2);
      assert.equal(args.batch.files[1].path, '/app/ai-exports/2.pdf');
      assert.deepEqual(args.batch.files.map(x => x.name), ['1.pdf', '2.pdf']);
      assert.equal(calls.at(-2).command, 'plugin:resources|close');
      if (outcome === 'failed') throw new Error('2件中1件を保存しました。容量不足');
      return { status: outcome, count: outcome === 'saved' ? 2 : 0 };
    }
    throw new Error(`Unexpected call: ${command}`);
  } } };
  const data = new Uint8Array(600000).fill(61);
  const files = [{ name: '1.pdf', blob: new Blob([data]) }, { name: '2.pdf', path: '/app/ai-exports/2.pdf' }];
  for (const result of ['saved', 'cancelled', 'failed']) {
    calls.length = 0; written.length = 0; outcome = result;
    if (result === 'failed') await assert.rejects(saveNativeFiles(files), /2件中1件.*容量不足/);
    else assert.equal((await saveNativeFiles(files)).status, result);
    assert.deepEqual(Buffer.concat(written), Buffer.from(data));
    assert.equal(calls.filter(x => x.command === 'plugin:tcg-folder|save_files').length, 1);
    const removed = calls.filter(x => x.command === 'plugin:fs|remove');
    assert.equal(removed.length, 1); assert.match(removed[0].args.path, /^\/cache\/tcg-exports\/.+\.tmp$/);
    assert.equal(calls.at(-1).command, 'plugin:fs|remove');
  }
});
