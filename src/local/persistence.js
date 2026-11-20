import { splitImages, restoreImages, copyLibrary } from './storedImages.js';

// Metadata and new images commit atomically; unchanged images are not rewritten.
export function openLibrary(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('このブラウザではデータを保存できません。通常モードで開いてください。')); return; }
    const request = factory.open('tcg-local-library-v1', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('library')) db.createObjectStore('library');
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('別のタブを閉じてから再読み込みしてください。'));
    request.onsuccess = () => {
      const db = request.result;
      const known = new Map();
      db.onversionchange = () => db.close();
      resolve({
        read: () => new Promise((ok, fail) => {
          const tx = db.transaction(['library', 'images'], 'readonly');
          const get = tx.objectStore('library').get('current');
          const images = new Map();
          const cursor = tx.objectStore('images').openCursor();
          cursor.onsuccess = () => { const row = cursor.result; if (row) { images.set(row.key, row.value); row.continue(); } };
          tx.oncomplete = () => {
            try {
              const value = restoreImages(get.result, images);
              known.clear(); for (const [id, image] of images) known.set(image, id);
              ok(value);
            } catch (error) { fail(error); }
          };
          tx.onabort = tx.onerror = () => fail(tx.error || new Error('保存データを読み込めませんでした。'));
        }),
        write: value => new Promise((ok, fail) => {
          const nextKnown = new Map(known);
          const split = splitImages(value, nextKnown);
          const tx = db.transaction(['library', 'images'], 'readwrite');
          tx.oncomplete = () => { known.clear(); for (const entry of nextKnown) known.set(...entry); ok(); };
          tx.onabort = tx.onerror = () => fail(tx.error || new Error('データを保存できませんでした。'));
          try {
            tx.objectStore('library').put(split.value, 'current');
            const images = tx.objectStore('images');
            for (const [id, image] of split.additions) images.put(image, id);
            for (const [image, id] of nextKnown) if (!split.used.has(id)) {
              images.delete(id); nextKnown.delete(image);
            }
          } catch (error) {
            try { tx.abort(); } catch { /* Already aborted. */ }
            fail(error);
          }
        }),
        close: () => db.close(),
      });
    };
  });
}

export function createSaveQueue(write, onStatus = () => {}) {
  let pending, running, failure;
  async function drain() {
    while (pending) {
      const value = pending; pending = null;
      try { await write(value); failure = null; }
      catch (error) { failure = error; }
    }
    running = null;
    onStatus(failure ? { kind: 'error', message: '自動保存できませんでした。「設定」でバックアップを保存し、端末の空き容量を確認してください。' } : { kind: 'saved', message: '端末に保存済み' });
  }
  return {
    enqueue(value) {
      pending = copyLibrary(value);
      onStatus({ kind: 'saving', message: '端末に保存中…' });
      if (!running) running = Promise.resolve().then(drain);
    },
    async flush() { await running; if (failure) throw failure; },
  };
}
