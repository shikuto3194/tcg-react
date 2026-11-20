import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { allDeckCards, sidesOf, sideLabel, validateSideSettings, nextSideName } from './sideDecks.js';
import { ownershipShortages } from './ownership.js';
import { initializeLibrary, addCard, editCard, applySettings, getLocalSettings, getLocalCards, getLocalStorage, importCardFiles, flushLibrary, exportLibrary, restoreLibrary, snapshotLibrary, createGame, switchGame, setCardViewMode } from './store.js';
import { openLibrary } from './persistence.js';
import { validateLibrary, LIBRARY_FORMAT } from './backup.js';
import { makeDeckJson, prepareDeckImport } from './deckJson.js';
import { dailyResults, createEvent, createMatch } from '../analysis/model.js';
import { validateEvents } from '../analysis/validation.js';
import { keysOf, addField, fieldInUse, numberOf } from './cardFields.js';

const fixture = () => ({ format: LIBRARY_FORMAT, activeGameId: 'test', games: [{ gameId: 'test', name: '確認', cards: [], settings: { labels: Array.from({ length: 6 }, (_, i) => `項目${i + 1}`), source: 'folder' }, storage: {} }] });

test('所持0を不足に含め、未入力を除外し、全保存デッキのメインと全サイドをカードIDで合算する', () => {
  const cards = [{ id: 1, ownedCount: 3, isDoubleSided: true }, { id: 2, ownedCount: 0 }, { id: 3, ownedCount: '' }, { id: 4 }, { id: 5, ownedCount: 2 }];
  const decks = [{ cards: cards.map(card => ({ id: card.id, count: 2 })), sideDecks: { a: [{ id: 1, count: 3 }], b: [{ id: 1, count: 1 }] } }, { cards: [{ id: 1, count: 2 }] }];
  assert.deepEqual(ownershipShortages(cards, decks).map(({ id, usedCount, shortage }) => ({ id, usedCount, shortage })), [{ id: 1, usedCount: 8, shortage: 5 }, { id: 2, usedCount: 2, shortage: 2 }]);
  assert.equal(allDeckCards(decks[0]).length, 7);
  assert.deepEqual(['サ1', 'サ12', '予備デッキ', '領土デッキ', 'トークン'].map(sideLabel), ['サ1', 'サ12', '予', '領', 'ト']);
  assert.equal(nextSideName([{ name: 'サ1' }, { name: 'サ3' }]), 'サ2');
  assert.equal(nextSideName([{ name: '予備' }, { name: 'サ2' }]), 'サ1');
});

test('所持枚数・複数サイド・表示状態は再接続とバックアップで保持し、別ゲームへ混ぜない', async () => {
  const factory = new IDBFactory(); let db = await openLibrary(factory);
  await db.write(fixture()); await initializeLibrary(db);
  const id = addCard({ name: '所持カード', ownedCount: '3' });
  applySettings({ ...getLocalSettings(), sideDecks: [{ id: 'one', name: 'サ1' }, { id: 'two', name: '領土デッキ' }] });
  const deck = { id: 'saved-test', name: '保存', cards: [{ id, count: 2 }], sideDecks: { one: [{ id, count: 1 }], two: [{ id, count: 4 }] } };
  getLocalStorage().setItem('savedCanvasDecks', JSON.stringify([deck]));
  getLocalStorage().setItem('draft', JSON.stringify({ deck: [], sideDecks: deck.sideDecks }));
  assert.throws(() => applySettings({ ...getLocalSettings(), sideDecks: [] }), /先にカードを外して/);
  editCard(id, null, { ownedCount: '0' }); assert.equal(getLocalCards()[0].ownedCount, 0);
  importCardFiles([], [{ source: 'counts.csv', record: { id, ownedCount: '' } }]); assert.equal(getLocalCards()[0].ownedCount, '');
  const before = snapshotLibrary();
  assert.throws(() => importCardFiles([], [{ source: 'counts.csv', record: { id, ownedCount: 4 } }, { source: 'counts.csv', record: { id, ownedCount: -1 } }]), /所持枚数/);
  assert.deepEqual(snapshotLibrary(), before);
  editCard(id, null, { ownedCount: 3 }); setCardViewMode('list'); await flushLibrary();
  db.close(); db = await openLibrary(factory); await initializeLibrary(db);
  assert.equal(snapshotLibrary().viewMode, 'list'); assert.equal(getLocalCards()[0].ownedCount, 3);
  assert.deepEqual(JSON.parse(getLocalStorage().getItem('savedCanvasDecks'))[0], deck);
  const other = createGame('別ゲーム'); assert.equal(getLocalSettings().sideDecks.length, 0); assert.equal(getLocalCards().length, 0);
  switchGame('test'); assert.equal(getLocalSettings().sideDecks[1].name, '領土デッキ');
  const backup = await exportLibrary(() => { throw new Error('No images'); }); await restoreLibrary(backup);
  const restored = snapshotLibrary().games.find(game => game.name === '確認（復元）');
  assert.notEqual(restored.gameId, 'test'); assert.equal(restored.cards[0].ownedCount, 3);
  const restoredDeck = JSON.parse(restored.storage.savedCanvasDecks)[0];
  assert.notEqual(restoredDeck.id, deck.id);
  assert.deepEqual({ ...restoredDeck, id: deck.id }, deck);
  switchGame(other); assert.equal(getLocalCards().length, 0); db.close();
});

test('以前のトークン枚数を保持し、不正なサイド設定・カード参照・所持枚数を拒否する', () => {
  const library = fixture();
  library.games[0].cards = [{ id: 1, name: '両面', isDoubleSided: true, front: { name: '表', image: '' }, back: { name: '裏', image: '' }, ownedCount: 2 }];
  library.games[0].storage.draft = JSON.stringify({ deck: [], tokenDeck: { 1: 3 } });
  const valid = validateLibrary(library);
  assert.deepEqual(valid.games[0].settings.sideDecks, [{ id: 'legacy-token', name: 'トークン', color: '#b85e00' }]);
  assert.deepEqual(sidesOf(JSON.parse(valid.games[0].storage.draft)), { 'legacy-token': [{ id: 1, count: 3 }] });
  for (const sideDecks of [{ missing: [{ id: 1, count: 1 }] }, { 'legacy-token': [{ id: 9, count: 1 }] }, { 'legacy-token': [{ id: 1, count: -1 }] }, { 'legacy-token': [{ id: 1, count: 1 }, { id: 1, count: 1 }] }]) {
    const bad = structuredClone(valid); bad.games[0].storage.draft = JSON.stringify({ deck: [], sideDecks }); assert.throws(() => validateLibrary(bad));
  }
  for (const value of [-1, 1.5, 'oops', true]) { const bad = structuredClone(valid); bad.games[0].cards[0].ownedCount = value; assert.throws(() => validateLibrary(bad)); }
  for (const id of ['__proto__', 'constructor', 'main']) assert.throws(() => validateSideSettings([{ id, name: '危険なID' }]));
  assert.throws(() => validateSideSettings([{ id: 'a', name: 'a' }, { id: 'a', name: 'b' }]));
});

test('デッキJSONは複数サイドのカードIDと名前を照合し、読込先の所持枚数を保持する', () => {
  const settings = { labels: ['項目1'], source: 'folder', sideDecks: [{ id: 'a', name: '予備' }, { id: 'b', name: '領土' }] };
  const cards = [{ id: 1, name: 'a', mockPath: 'a.png', ownedCount: 2 }];
  const json = makeDeckJson({ name: '出力', cards: [], sideDecks: { a: [{ id: 1, count: 3 }], b: [{ id: 1, count: 4 }] }, thumbnailCardId: 1 }, settings, cards);
  const target = { ...settings, sideDecks: [{ id: 'x', name: '予備' }, { id: 'y', name: '領土' }] };
  const imported = prepareDeckImport(json, target, [{ ...cards[0], id: 99, ownedCount: 8 }]);
  assert.equal(imported.sideDecks.x[0].id, 99); assert.equal(imported.sideDecks.x[0].count, 3); assert.equal(imported.sideDecks.y[0].count, 4);
  assert.equal(imported.sideDecks.x[0].ownedCount, 8); assert.equal(imported.thumbnailCardId, 99);
  assert.throws(() => prepareDeckImport(json, { ...target, sideDecks: [] }, cards), /サイドデッキ/);
  assert.throws(() => prepareDeckImport({ ...json, sideDecks: { a: [{ id: 1, count: 1 }, { id: 1, count: 2 }] } }, settings, cards), /サイドデッキ/);
});

test('戦績の構築に記録したサイド名と枚数を検証し、当時の内容を保持する', () => {
  const event = { ...createEvent(), matches: [{ ...createMatch(), result: 'win', sideDeckSettings: [{ id: 'a', name: '当時の名前' }], sideDecks: { a: [{ id: 999, count: 3 }] } }] };
  const saved = validateEvents([event]); event.matches[0].sideDecks.a[0].count = 9;
  assert.equal(saved[0].matches[0].sideDecks.a[0].count, 3); assert.equal(saved[0].matches[0].sideDeckSettings[0].name, '当時の名前');
  assert.throws(() => validateEvents([{ ...event, matches: [{ ...event.matches[0], sideDecks: { invalid: [] } }] }]));
});

test('戦績グラフは今日まで30日を日別集計し、日時不明・期間外・勝敗不明を除外する', () => {
  const rows = [{ at: '2026-09-09T12:00', result: 'win' }, { at: '2026-10-08', result: 'loss' }, { at: '2026-10-08', result: 'draw' }, { at: '2026-09-08', result: 'win' }, { at: '2026-10-09', result: 'win' }, { at: '', result: 'win' }, { at: '2026-10-08', result: '' }];
  const days = dailyResults(rows, { from: '2026-09-09', to: '2026-10-08' });
  assert.equal(days.length, 2); assert.deepEqual(days[0], { day: '2026-09-09', win: 1, loss: 0, draw: 0 });
  assert.deepEqual(days.at(-1), { day: '2026-10-08', win: 0, loss: 1, draw: 1 });
  assert.equal(days.reduce((n, day) => n + day.win + day.loss + day.draw, 0), 3);
});

test('未使用の項目を途中から削除しても残る番号・値・CSV対応はずれず、使用中・セット指定は保護する', async () => {
  let library = fixture();
  await initializeLibrary({ read: async () => library, write: async value => { library = structuredClone(value); } });
  const id = addCard({ name: '項目確認', color: '赤', cost: 0 });
  const old = getLocalSettings(), keys = keysOf(old);
  const deleted = { ...old, labels: old.labels.filter((_, i) => i !== 1), fieldKeys: keys.filter(key => key !== 'type') };
  applySettings(deleted);
  assert.deepEqual(keysOf(getLocalSettings()).map(numberOf), [1, 3, 4, 5, 6]);
  assert.equal(getLocalCards()[0].cost, '0');
  const before = snapshotLibrary();
  assert.throws(() => applySettings({ ...deleted, labels: deleted.labels.slice(1), fieldKeys: deleted.fieldKeys.slice(1) }), /使われている項目/);
  assert.deepEqual(snapshotLibrary(), before);
  assert.equal(fieldInUse([{ isDoubleSided: true, front: { name: '表' }, back: { type: '裏だけに値' } }], 'type', 'folder'), true);
  assert.equal(fieldInUse([], 'tribe', 'tribe'), true);
  importCardFiles([], [{ source: 'test.csv', record: { id, item5: 7 } }]);
  assert.equal(getLocalCards()[0].cost, '7'); assert.equal(getLocalCards()[0].reduction, undefined);
  await flushLibrary(); await initializeLibrary({ read: async () => library, write: async value => { library = value; } });
  assert.deepEqual(keysOf(getLocalSettings()), deleted.fieldKeys);
  applySettings(addField(getLocalSettings()));
  assert.equal(keysOf(getLocalSettings()).at(-1), 'type');
  importCardFiles([], [{ source: 'test.csv', record: { id, item2: '復帰した項目' } }]);
  assert.equal(getLocalCards()[0].type, '復帰した項目'); assert.equal(getLocalCards()[0].cost, '7');
  const blank = createGame('全項目なし');
  applySettings({ ...getLocalSettings(), labels: [], fieldKeys: [] });
  addCard({ name: '名前だけ' });
  const backup = await exportLibrary(() => { throw new Error('No images'); });
  assert.equal(validateLibrary(backup).games.find(game => game.gameId === blank).settings.labels.length, 0);
});
