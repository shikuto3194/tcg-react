// Runtime/backup objects keep data URLs. Only the IndexedDB representation uses
// references, so existing backups and callers retain their format.
export function splitImages(value, known = new Map()) {
  const additions = new Map();
  const used = new Set();
  const visit = item => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).map(([key, entry]) => {
      if (key === 'image' && typeof entry === 'string' && entry.startsWith('data:image/')) {
        let id = known.get(entry);
        if (!id) { id = `tcg-image:${globalThis.crypto.randomUUID()}`; known.set(entry, id); additions.set(id, entry); }
        used.add(id);
        return [key, id];
      }
      return [key, visit(entry)];
    }));
  };
  return { value: visit(value), additions, used };
}

export function restoreImages(value, images) {
  const visit = item => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).map(([key, entry]) => {
      if (key === 'image' && typeof entry === 'string' && entry.startsWith('tcg-image:')) {
        if (!images.has(entry)) throw new Error('保存されたカード画像が見つかりません。バックアップから復元してください。');
        return [key, images.get(entry)];
      }
      return [key, visit(entry)];
    }));
  };
  return visit(value);
}

// Copy mutable records/arrays but reuse immutable strings, including image URLs.
export function copyLibrary(value) {
  if (Array.isArray(value)) return value.map(copyLibrary);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copyLibrary(entry)]));
  return value;
}
