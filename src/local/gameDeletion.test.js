import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary } from './persistence.js';
import { initializeLibrary, commitGameDeletion, createGame, getGames, getLibraryRevision, getLocalStorage, snapshotLibrary, flushLibrary, exportLibrary, restoreLibrary } from './store.js';
import { createEvent } from '../analysis/model.js';

const shared = 'data:image/png;base64,c2hhcmVk';
const imageA = 'data:image/png;base64,ZGVsZXRlZA==';
const imageB = 'data:image/png;base64,cHJlc2VydmVk';
const game = (gameId, image) => ({
  gameId, name: '同じ名前', settings: { labels: [], source: 'folder' },
  cards: [{ id: 1, name: '共用画像', image: shared }, { id: 2, name: '専用画像', image, ownedCount: 3 }],
  storage: { draft: JSON.stringify({ deck: [{ id: 2, count: 1 }], deckName: '作成中' }), savedCanvasDecks: JSON.stringify([{ id: `deck-${gameId}`, name: '保存デッキ', cards: [{ id: 1, count: 2 }] }]) },
  events: [createEvent()],
});
const fixture = () => ({ format: 'tcg-local-library-v1', activeGameId: 'game-1', games: [game('game-1', imageA), game('game-2', imageB)] });
const storedImages = factory => new Promise((resolve, reject) => {
  const open = factory.open('tcg-local-library-v1', 2);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result, tx = db.transaction('images', 'readonly'), get = tx.objectStore('images').getAll();
    tx.oncomplete = () => { db.close(); resolve(get.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  };
});

test('対象ゲームの全データと専用画像を削除し、同名の他ゲーム・共有画像・バックアップ復元を維持', async () => {
  const factory = new IDBFactory();
  let db = await openLibrary(factory);
  await db.write(fixture()); await initializeLibrary(db);
  const before = snapshotLibrary(); const backup = await exportLibrary();
  assert.equal((await storedImages(factory)).length, 3);
  const result = await commitGameDeletion('game-1', getLibraryRevision());
  assert.equal(result.status, 'saved');
  assert.deepEqual(result.data, { deletedGameId: 'game-1', gameId: 'game-2' });
  assert.deepEqual(snapshotLibrary().games, [before.games[1]]);
  assert.deepEqual((await storedImages(factory)).sort(), [shared, imageB].sort());
  assert.equal(getLocalStorage('game-1').getItem('draft'), null);
  assert.equal(getLocalStorage('game-1').getItem('savedCanvasDecks'), null);
  db.close(); db = await openLibrary(factory); await initializeLibrary(db);
  assert.deepEqual(snapshotLibrary().games, [before.games[1]]);
  assert.equal((await exportLibrary()).games.length, 1);
  await restoreLibrary(backup);
  assert.equal(getGames().length, 3);
  const restored = snapshotLibrary().games.find(row => row.cards.some(card => card.image === imageA));
  assert.ok(restored && restored.gameId !== 'game-1');
  assert.equal(restored.events.length, 1);
  assert.deepEqual((await storedImages(factory)).sort(), [shared, imageA, imageB].sort());
  db.close();
});

test('最後のゲームを削除すると空のゲームを保存し、再起動・追加でも削除済みIDを再利用しない', async () => {
  let saved = fixture(); saved.games.pop();
  const adapter = { read: async () => structuredClone(saved), write: async value => { saved = structuredClone(value); } };
  await initializeLibrary(adapter);
  const result = await commitGameDeletion('game-1', getLibraryRevision());
  const id = result.data.gameId;
  assert.notEqual(id, 'game-1');
  assert.deepEqual(getGames(), [{ id, name: '新しいゲーム', cards: 0, decks: 0 }]);
  const empty = snapshotLibrary().games[0];
  assert.deepEqual(empty.events, []); assert.deepEqual(empty.storage, {});
  await initializeLibrary(adapter);
  assert.equal(snapshotLibrary().activeGameId, id);
  const added = createGame('再起動後の追加'); await flushLibrary();
  assert.notEqual(added, 'game-1'); assert.notEqual(added, id);
});

test('削除保存の失敗と古い確認を拒否し、次の自動保存にも削除を混ぜない', async () => {
  let saved = fixture(), rejectDeletion = false;
  const adapter = { read: async () => structuredClone(saved), write: async value => {
    if (rejectDeletion && value.games.length < 2) throw new Error('容量不足');
    saved = structuredClone(value);
  } };
  await initializeLibrary(adapter);
  const before = snapshotLibrary(), revision = getLibraryRevision();
  rejectDeletion = true;
  await assert.rejects(commitGameDeletion('game-1', revision), /容量不足/);
  assert.deepEqual(snapshotLibrary(), before); assert.equal(getLibraryRevision(), revision);
  getLocalStorage('game-2').setItem('draft', JSON.stringify({ deck: [], deckName: '別の変更' }));
  await flushLibrary();
  assert.equal(saved.games.length, 2); assert.deepEqual(saved.games[0], before.games[0]);
  await assert.rejects(commitGameDeletion('game-1', revision), { code: 'CONFLICT' });
  await assert.rejects(commitGameDeletion('missing', getLibraryRevision()), { code: 'NOT_FOUND' });
  rejectDeletion = false;
  await commitGameDeletion('game-1', getLibraryRevision());
  assert.equal(saved.games.length, 1);
});
