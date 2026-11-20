import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeLibrary, getSavedDecks, commitSavedDecks, getLocalStorage, getLocalSettings, applySettings, createGame, switchGame, setCardViewMode, flushLibrary } from './store.js';

test('保存デッキは保存完了を待ち、失敗した追加・上書き・削除を後続の自動保存へ混ぜない', async () => {
  const original = [{ id: 'deck-a', name: 'A', cards: [{ id: 1, count: 2 }] }];
  let persisted = { format: 'tcg-local-library-v1', activeGameId: 'save', games: [{ gameId: 'save', name: '保存確認', cards: [{ id: 1, name: 'カード', image: '' }], settings: { labels: [], source: 'folder' }, storage: { savedCanvasDecks: JSON.stringify(original) } }] };
  let fail = false, release;
  await initializeLibrary({ read: async () => persisted, write: async value => {
    if (release) await new Promise(resolve => { release = resolve; });
    if (fail) throw new Error('容量不足');
    persisted = structuredClone(value);
  } });
  assert.equal(getSavedDecks('save'), getSavedDecks('save'), 'subscription snapshots are stable');
  for (const next of [[...original, { name: 'B', cards: [] }], [{ name: 'A', cards: [{ id: 1, count: 5 }] }], []]) {
    fail = true;
    await assert.rejects(commitSavedDecks('save', next), /容量不足/);
    assert.deepEqual(getSavedDecks('save'), original);
    fail = false; setCardViewMode('list'); await flushLibrary();
    assert.deepEqual(JSON.parse(persisted.games[0].storage.savedCanvasDecks), original);
  }
  release = true;
  let completed = false;
  const pending = commitSavedDecks('save', previous => [...previous, { name: 'B', cards: [] }]).then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  await assert.rejects(commitSavedDecks('save', []), /保存が終わるまで/);
  const done = release; release = null; done(); await pending;
  assert.equal(completed, true);
  assert.equal(JSON.parse(persisted.games[0].storage.savedCanvasDecks).length, 2);
  const other = createGame('別ゲーム'); await flushLibrary();
  await commitSavedDecks('save', original);
  assert.deepEqual(getSavedDecks(other), []);
  switchGame('save');
  applySettings({ ...getLocalSettings(), sideDecks: [{ id: 'unused', name: '予備' }] });
  getLocalStorage().setItem('savedCanvasDecks', JSON.stringify([{ ...original[0], sideDecks: { unused: [] } }]));
  applySettings({ ...getLocalSettings(), sideDecks: [] });
  assert.deepEqual(getSavedDecks()[0].sideDecks, {});
  await flushLibrary();
});
