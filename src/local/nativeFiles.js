import { nativeHost } from './nativeHost.js';

// Native reads return bytes without the browser's file MIME metadata.
export function nativeImportFile(bytes, path) {
  const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', csv: 'text/csv', json: 'application/json' };
  const file = new File([bytes], path.split('/').at(-1), { type: types[path.split('.').at(-1).toLowerCase()] || '' });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

const FILE_CHUNK_BYTES = 256 * 1024;
async function writeChunk(file, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const count = await file.write(bytes.subarray(offset));
    if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) throw new Error('ファイルを書き込めませんでした。');
    offset += count;
  }
}
async function saveNativeContent(name, write, sourcePath) {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { open, mkdir, remove } = await import('@tauri-apps/plugin-fs');
  try {
    const path = await save({ defaultPath: name });
    if (!path) return { status: 'cancelled' };
    const writeFile = async target => {
      const file = await open(target, { write: true, create: true, truncate: true });
      try { await write(file); }
      finally { await file.close(); }
    };
    if (path.startsWith('content://')) {
      // Android's provider must see its Java stream close to update file metadata.
      const { invoke } = await import('@tauri-apps/api/core');
      const copy = source => invoke('plugin:tcg-folder|copy_document', { file: { path: source, uri: path } });
      if (sourcePath) await copy(sourcePath);
      else {
        const { appCacheDir, join } = await import('@tauri-apps/api/path');
        const dir = await join(await appCacheDir(), 'tcg-exports');
        await mkdir(dir, { recursive: true });
        const temporary = await join(dir, `${crypto.randomUUID()}.tmp`);
        try { await writeFile(temporary); await copy(temporary); }
        finally { await remove(temporary).catch(() => {}); }
      }
    } else await writeFile(path);
    return { status: 'saved', path };
  } catch (error) {
    if (/cancel/i.test(String(error))) return { status: 'cancelled' };
    throw error;
  }
}
async function writeNativeSource(output, source) {
  if (source.blob) {
    for (let offset = 0; offset < source.blob.size; offset += FILE_CHUNK_BYTES) {
      await writeChunk(output, new Uint8Array(await source.blob.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer()));
    }
  } else {
    const { open } = await import('@tauri-apps/plugin-fs');
    const input = await open(source.path, { read: true });
    try {
      const buffer = new Uint8Array(FILE_CHUNK_BYTES);
      let count;
      while ((count = await input.read(buffer)) !== null) {
        if (count <= 0) throw new Error('ファイルを読み込めませんでした。');
        await writeChunk(output, buffer.subarray(0, count));
      }
    } finally { await input.close(); }
  }
}
export async function saveNativeBlob(blob, name) {
  return saveNativeContent(name, output => writeNativeSource(output, { blob }));
}
export async function saveAIFile(file) {
  return saveNativeContent(file.name, output => writeNativeSource(output, file), file.path);
}

function exportNames(files) {
  const used = new Set();
  return files.map((file, index) => {
    let name = [...(file.name || `file-${index + 1}`)].map(ch => ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? '_' : ch).join('').slice(-150).replace(/[. ]+$/, '') || 'file';
    while (new TextEncoder().encode(name).length > 180) name = [...name].slice(1).join('');
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    let unique = name, suffix = 2;
    while (used.has(unique.toLowerCase())) unique = `${stem} (${suffix++})${ext}`;
    used.add(unique.toLowerCase());
    return unique;
  });
}

// Multiple outputs share one destination selection. A new folder keeps older exports intact.
export async function saveNativeFiles(files) {
  if (!files.length) throw new Error('保存できるファイルがありません。');
  if (files.length === 1) return files[0].blob ? saveNativeBlob(files[0].blob, files[0].name) : saveAIFile(files[0]);
  const { open, mkdir, remove } = await import('@tauri-apps/plugin-fs');
  const { join, appCacheDir } = await import('@tauri-apps/api/path');
  const names = exportNames(files);
  const folder = `TCG出力-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const write = async (source, target) => {
    const output = await open(target, { write: true, createNew: true });
    try {
      try { await writeNativeSource(output, source); } finally { await output.close(); }
    } catch (error) { await remove(target).catch(() => {}); throw error; }
  };
  if (/Android/i.test(navigator.userAgent)) {
    const { invoke } = await import('@tauri-apps/api/core');
    const temporary = [];
    try {
      const sources = [];
      for (const [index, file] of files.entries()) {
        let path = file.path;
        if (file.blob) {
          const cache = await join(await appCacheDir(), 'tcg-exports');
          await mkdir(cache, { recursive: true });
          path = await join(cache, `${crypto.randomUUID()}.tmp`);
          temporary.push(path);
          await write(file, path);
        }
        sources.push({ name: names[index], path });
      }
      return await invoke('plugin:tcg-folder|save_files', { batch: { name: folder, files: sources } });
    } finally { await Promise.all(temporary.map(path => remove(path).catch(() => {}))); }
  }
  const { open: chooseFolder } = await import('@tauri-apps/plugin-dialog');
  const parent = await chooseFolder({ directory: true, recursive: true, title: 'まとめて保存する場所を選ぶ' });
  if (!parent) return { status: 'cancelled' };
  const path = await join(parent, folder);
  await mkdir(path);
  let count = 0;
  for (const [index, file] of files.entries()) {
    const target = await join(path, names[index]);
    try { await write(file, target); count++; }
    catch (error) {
      throw new Error(`${files.length}件中${count}件を保存しました。保存先：${path}。残りは保存できませんでした。${error.message || error}`);
    }
  }
  return { status: 'saved', count, path };
}
export async function openNativeFile(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('出力ファイルを開けませんでした。');
  const blob = await response.blob();
  if (/Android/i.test(navigator.userAgent)) {
    const { invoke } = await import('@tauri-apps/api/core');
    const { blobData } = await import('./outputFiles.js');
    await invoke('plugin:tcg-folder|open_file', { file: { name, mime: blob.type.split(';')[0], base64: (await blobData(blob)).split(',')[1] } });
    return;
  }
  const { appCacheDir, join } = await import('@tauri-apps/api/path');
  const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
  const { openPath } = await import('@tauri-apps/plugin-opener');
  const dir = await join(await appCacheDir(), 'tcg-exports');
  await mkdir(dir, { recursive: true });
  const safeName = [...name].map(ch => ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? '_' : ch).join('').slice(-150);
  const path = await join(dir, `${crypto.randomUUID()}-${safeName}`);
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  await openPath(path);
}
export function installNativeDownloads() {
  if (!nativeHost()) return;
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[download]');
    if (!anchor || !anchor.download) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void (async () => {
      try { const response = await fetch(anchor.href); if (!response.ok) throw new Error('出力ファイルを開けませんでした。'); await saveNativeBlob(await response.blob(), anchor.download); }
      catch (error) { alert(`保存できませんでした。${error.message || error}`); }
    })();
  }, true);
}
export async function pickNativeFolder() {
  let entries;
  if (/Android/i.test(navigator.userAgent)) {
    const { invoke } = await import('@tauri-apps/api/core');
    entries = (await invoke('plugin:tcg-folder|pick_folder')).files;
    return entries.map(entry => nativeImportFile(Uint8Array.from(atob(entry.base64), ch => ch.charCodeAt(0)), entry.path));
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readDir, readFile, stat } = await import('@tauri-apps/plugin-fs');
  const dir = await open({ directory: true, recursive: true });
  if (!dir) return [];
  const result = []; let total = 0, visited = 0;
  const walk = async (path, relative, depth = 0) => {
    if (depth > 32) throw new Error('フォルダが深すぎます。小さい範囲を選んでください。');
    for (const entry of await readDir(path)) {
      if (++visited > 20000) throw new Error('項目が多すぎます。小さい範囲を選んでください。');
      if (entry.isSymlink) continue;
      const child = `${path}/${entry.name}`, name = `${relative}/${entry.name}`;
      if (entry.isDirectory) await walk(child, name, depth + 1);
      else if (/\.(png|jpe?g|webp|gif|csv|json)$/i.test(entry.name)) {
        if (total + (await stat(child)).size > 100 * 1024 * 1024 || result.length >= 10000) throw new Error('1回に読み込めるのは100MB・10000ファイルまでです。');
        const bytes = await readFile(child); total += bytes.length;
        if (total > 100 * 1024 * 1024 || result.length >= 10000) throw new Error('1回に読み込めるのは100MB・10000ファイルまでです。');
        result.push(nativeImportFile(bytes, name));
      }
    }
  };
  await walk(dir, dir.replaceAll('\\', '/').split('/').at(-1)); return result;
}
