import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { matchesOwnership, ownedSnapshot, ownershipSummary, ownershipUsage } from './ownership.js';
import { openLibrary } from './persistence.js';
import { initializeLibrary, commitOwnedCounts, snapshotLibrary, flushLibrary, setCardViewMode, exportLibrary, restoreLibrary, switchGame } from './store.js';

const fixture = () => ({ format: 'tcg-local-library-v1', activeGameId: 'own', games: [{ gameId: 'own', name: '所持確認', cards: [{ id: 1, name: '表', isDoubleSided: true, front: { name: '表', image: '' }, back: { name: '裏', image: '' }, ownedCount: 2, mockLimit: '0' }, { id: 2, name: '未入力', image: '' }], settings: { labels: ['項目1'], source: 'folder', sideDecks: [{ id: 'side', name: '予備' }] }, storage: { draft: JSON.stringify({ deck: [{ id: 1, count: 4 }], sideDecks: { side: [{ id: 1, count: 2 }] } }) } } ] });

test('所持フィルターは0と未入力を区別し、不足は全サイドを含めて数える', () => {
  const usage = ownershipUsage([{ name: 'A', cards: [{ id: 1, count: 2 }], sideDecks: { side: [{ id: 1, count: 3 }] } }, { name: 'B', cards: [{ id: 1, count: 1 }] }], [{ id: 'side', name: '予備' }]);
  assert.equal(usage.get(1).total, 6);
  assert.deepEqual(usage.get(1).entries.map(entry => entry.zone), ['メイン', '予備', 'メイン']);
  const values = [undefined, null, '', 0, '0', 2, 6, 8];
  assert.deepEqual(values.filter(value => matchesOwnership(value, 'unknown')), [undefined, null, '']);
  assert.deepEqual(values.filter(value => matchesOwnership(value, 'zero')), [0, '0']);
  assert.deepEqual(values.filter(value => matchesOwnership(value, 'owned')), [2, 6, 8]);
  assert.deepEqual(values.filter(value => matchesOwnership(value, 'shortage', usage.get(1).total)), [0, '0', 2]);
  assert.deepEqual(values.filter(value => matchesOwnership(value, 'shortage')), []);
});

test('資産集計は両面を1種として数え、登録済みカードのセット順と未入力を保持する', () => {
  const cards = [{ id: 1, isDoubleSided: true, front: { pack: 'SG02 燈火の庭' }, back: { pack: '裏面セット' }, ownedCount: 3 }, { id: 2, pack: 'SG01 翠芽の庭', ownedCount: 0 }, { id: 3, pack: 'SG01 翠芽の庭' }, { id: 4, pack: '箱 10', ownedCount: 2 }, { id: 5, pack: '箱 2', ownedCount: '' }];
  assert.deepEqual(ownedSnapshot(cards), { 1: 3, 2: 0, 3: '', 4: 2, 5: '' });
  const result = ownershipSummary(cards);
  assert.deepEqual([result.registered, result.owned, result.total, result.zero, result.unknown], [5, 2, 5, 1, 2]);
  assert.deepEqual(result.packs.map(pack => pack.name), ['SG01 翠芽の庭', 'SG02 燈火の庭', '箱 2', '箱 10']);
});

test('所持枚数をまとめて保存し、失敗時は元に戻す。再試行・復元でもデッキと画像を維持する', async () => {
  const db = await openLibrary(new IDBFactory());
  await db.write(fixture());
  let fail = false;
  await initializeLibrary({ read: db.read, write: async value => { if (fail) throw new Error('容量不足'); await db.write(value); } });
  const before = snapshotLibrary();
  for (const bad of [-1, 0.5, true, 'x', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(commitOwnedCounts('own', { 1: 8, 2: bad }), /所持枚数/);
    assert.deepEqual(snapshotLibrary(), before);
  }
  await assert.rejects(commitOwnedCounts('own', { 99: 8 }), /カード/);
  fail = true;
  await assert.rejects(commitOwnedCounts('own', { 1: 8, 2: 0 }), /容量不足/);
  assert.deepEqual(snapshotLibrary(), before);
  assert.equal((await db.read()).games[0].cards[0].ownedCount, 2);
  fail = false;
  setCardViewMode('list'); await flushLibrary(); // Later autosaves must not leak the failed draft.
  assert.equal((await db.read()).games[0].cards[0].ownedCount, 2);
  await commitOwnedCounts('own', { 1: 8, 2: 0 });
  const saved = await db.read();
  assert.equal(saved.games[0].cards[0].ownedCount, 8); // No deck adoption limit.
  assert.equal(saved.games[0].cards[1].ownedCount, 0);
  assert.deepEqual(saved.games[0].storage, before.games[0].storage);
  assert.deepEqual(saved.games[0].cards[0].front, before.games[0].cards[0].front);
  const backup = await exportLibrary();
  await restoreLibrary(backup);
  assert.equal(snapshotLibrary().games.at(-1).cards[0].ownedCount, 8);
  await assert.rejects(commitOwnedCounts('own', { 1: 3 }), /ゲーム/);
  switchGame('own'); await commitOwnedCounts('own', { 1: '' });
  await initializeLibrary(db);
  assert.equal(snapshotLibrary().games.find(game => game.gameId === 'own').cards[0].ownedCount, '');
  db.close();
});
